
import React, { useState, useRef, useEffect, useCallback } from 'react';
// FIX: Removed unexported member `LiveSession` from import.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { MicIcon, MicOffIcon, PhoneOffIcon } from './icons';
import { decode, encode, decodeAudioData } from '../utils/audio';

type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

const Voice: React.FC = () => {
    const [status, setStatus] = useState<VoiceStatus>('idle');
    const [isMicOn, setIsMicOn] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // FIX: Changed `LiveSession` to `any` as it is not an exported type.
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputGainNodeRef = useRef<GainNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const startSession = useCallback(async () => {
        setErrorMessage(null);
        setStatus('connecting');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // FIX: Cast window to `any` to access vendor-prefixed `webkitAudioContext` without TypeScript errors.
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            // FIX: Cast window to `any` to access vendor-prefixed `webkitAudioContext` without TypeScript errors.
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        console.log('Session opened.');
                        setStatus('listening');
                        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        inputGainNodeRef.current = inputAudioContextRef.current!.createGain();

                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(new Int16Array(inputData.map(v => v * 32768)).buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        source.connect(inputGainNodeRef.current);
                        inputGainNodeRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            setStatus('speaking');
                            const audioCtx = outputAudioContextRef.current!;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                            
                            const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
                            
                            const source = audioCtx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(audioCtx.destination);
                            
                            source.onended = () => {
                                activeSourcesRef.current.delete(source);
                                if (activeSourcesRef.current.size === 0) {
                                    setStatus('listening');
                                }
                            };
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            activeSourcesRef.current.add(source);
                        }
                        if (message.serverContent?.interrupted) {
                            for(const source of activeSourcesRef.current) {
                                source.stop();
                            }
                            activeSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                            setStatus('listening');
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        let msg = "A session error occurred. Please try starting again.";
                        if (e.message) {
                            const lowerCaseMessage = e.message.toLowerCase();
                            if (lowerCaseMessage.includes('rate limit') || lowerCaseMessage.includes('quota') || lowerCaseMessage.includes('resource has been exhausted')) {
                                msg = "The System Has Been Under Attack Please Try Again letter";
                            }
                        }
                        setErrorMessage(msg);
                        setStatus('error');
                    },
                    onclose: () => {
                        console.log('Session closed.');
                        cleanup();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: 'You are RIjantuby AI, a helpful and friendly voice assistant.',
                },
            });

        } catch (error) {
            console.error('Failed to start session:', error);
            let msg = "An error occurred while starting the session. Please try again.";
            if (error instanceof Error) {
                const lowerCaseMessage = error.message.toLowerCase();
                if (lowerCaseMessage.includes('rate limit') || lowerCaseMessage.includes('quota') || lowerCaseMessage.includes('resource has been exhausted')) {
                    msg = "The System Has Been Under Attack Please Try Again letter";
                }
            }
            setErrorMessage(msg);
            setStatus('error');
        }
    }, []);

    const cleanup = useCallback(() => {
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        scriptProcessorRef.current?.disconnect();
        inputAudioContextRef.current?.close();
        outputAudioContextRef.current?.close();

        mediaStreamRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        sessionPromiseRef.current = null;
        nextStartTimeRef.current = 0;
        activeSourcesRef.current.clear();
        setStatus('idle');
    }, []);

    const endSession = useCallback(() => {
        sessionPromiseRef.current?.then(session => session.close());
        cleanup();
    }, [cleanup]);

    useEffect(() => {
        return () => {
            endSession();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleMic = () => {
        const newMicState = !isMicOn;
        setIsMicOn(newMicState);
        if (inputGainNodeRef.current) {
            inputGainNodeRef.current.gain.setValueAtTime(newMicState ? 1 : 0, inputAudioContextRef.current!.currentTime);
        }
    };

    const CircleAnimation = () => (
        <div className="relative w-64 h-64 md:w-96 md:h-96 flex items-center justify-center">
            {[...Array(3)].map((_, i) => (
                <div
                    key={i}
                    className={`absolute rounded-full border-2 border-blue-500/50 transition-all duration-700`}
                    style={{
                        width: `${(i + 1) * 33.33}%`,
                        height: `${(i + 1) * 33.33}%`,
                        opacity: status === 'speaking' ? 1 - i * 0.3 : 0,
                        transform: status === 'speaking' ? 'scale(1)' : 'scale(0.8)',
                        animation: status === 'speaking' ? `pulse-alt ${2 + i}s infinite cubic-bezier(0.4, 0, 0.6, 1)` : 'none'
                    }}
                />
            ))}
            <div className="absolute w-1/3 h-1/3 bg-blue-500 rounded-full transition-transform duration-500"
                style={{ transform: status === 'speaking' ? 'scale(1.1)' : 'scale(1)' }}
            />
        </div>
    );
    
    return (
        <div className="flex flex-col h-full items-center justify-center bg-gray-900 text-white p-4">
             <style>{`
                @keyframes pulse-alt {
                    50% { opacity: 0.5; }
                }
            `}</style>
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold">Ultra Voice Mode</h2>
                <p className="text-gray-400 capitalize">{status.replace('_', ' ')}</p>
            </div>
            
            <CircleAnimation />

            <div className="absolute bottom-10 flex items-center justify-center gap-6">
                {status !== 'idle' && status !== 'connecting' && (
                    <button onClick={toggleMic} className={`p-4 rounded-full transition-colors ${isMicOn ? 'bg-blue-600' : 'bg-gray-700'}`}>
                        {isMicOn ? <MicIcon className="w-8 h-8"/> : <MicOffIcon className="w-8 h-8"/>}
                    </button>
                )}

                {status === 'idle' || status === 'error' ? (
                    <button onClick={startSession} className="px-8 py-4 bg-green-600 rounded-full text-lg font-semibold hover:bg-green-700 transition-colors">
                        Start Conversation
                    </button>
                ) : (
                    <button onClick={endSession} className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-colors">
                        <PhoneOffIcon className="w-8 h-8"/>
                    </button>
                )}
            </div>
            {status === 'error' && <p className="text-red-500 mt-4">{errorMessage}</p>}
        </div>
    );
};

export default Voice;