
import React, { useState } from 'react';
import Chat from './components/Chat';
import Voice from './components/Voice';
import { BotIcon, MessageSquareIcon, MicIcon } from './components/icons';

type Tab = 'chat' | 'voice';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return <Chat />;
      case 'voice':
        return <Voice />;
      default:
        return <Chat />;
    }
  };

  // FIX: Changed icon type from JSX.Element to React.ReactNode to resolve "Cannot find namespace 'JSX'" error.
  const TabButton = ({ tab, icon, label }: { tab: Tab, icon: React.ReactNode, label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${
        activeTab === tab
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans">
      <header className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3 mb-4 sm:mb-0">
          <BotIcon className="w-8 h-8 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">RIjantuby AI</h1>
        </div>
        <nav className="flex items-center gap-3">
          <TabButton tab="chat" icon={<MessageSquareIcon className="w-5 h-5" />} label="Chat" />
          <TabButton tab="voice" icon={<MicIcon className="w-5 h-5" />} label="Voice" />
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        {renderTabContent()}
      </main>
    </div>
  );
};

export default App;