import { useState, useEffect, useRef } from 'react';
import { messagesAPI } from '../../api/activity';
import { usersAPI } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PageLoading, Avatar, EmptyState } from '../common/ui';
import { FiMessageSquare, FiSend, FiPlus, FiHash, FiUser, FiX, FiSave } from 'react-icons/fi';

export default function Messaging() {
  const { user } = useAuth();
  const { addToast } = useApp();
  const [activeView, setActiveView] = useState('dm'); // dm | channel
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [newChannelModal, setNewChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    usersAPI.list({ is_active: true })
      .then(r => setUsers((r.data?.results ?? r.data ?? []).filter(u => u.id !== user?.id)))
      .catch(() => {});
    messagesAPI.channels()
      .then(r => setChannels(r.data?.results ?? r.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadDM = async (u) => {
    setSelectedUser(u);
    setSelectedChannel(null);
    setActiveView('dm');
    setLoading(true);
    try {
      const r = await messagesAPI.conversation(u.id);
      setMessages(r.data?.results ?? r.data ?? []);
    } catch { setMessages([]); }
    finally { setLoading(false); }

    // Poll every 5s
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await messagesAPI.conversation(u.id);
        setMessages(r.data?.results ?? r.data ?? []);
      } catch {}
    }, 5000);
  };

  const loadChannel = async (ch) => {
    setSelectedChannel(ch);
    setSelectedUser(null);
    setActiveView('channel');
    setLoading(true);
    try {
      const r = await messagesAPI.getChannel(ch.id);
      setMessages(r.data?.messages ?? []);
    } catch { setMessages([]); }
    finally { setLoading(false); }

    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await messagesAPI.getChannel(ch.id);
        setMessages(r.data?.messages ?? []);
      } catch {}
    }, 5000);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const content = message.trim();
    setMessage('');
    try {
      if (activeView === 'dm' && selectedUser) {
        await messagesAPI.sendDM(selectedUser.id, content);
        const r = await messagesAPI.conversation(selectedUser.id);
        setMessages(r.data?.results ?? r.data ?? []);
      } else if (activeView === 'channel' && selectedChannel) {
        await messagesAPI.sendChannelMsg(selectedChannel.id, content);
        const r = await messagesAPI.getChannel(selectedChannel.id);
        setMessages(r.data?.messages ?? []);
      }
    } catch { addToast('Failed to send message', 'error'); }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      await messagesAPI.createChannel({ name: newChannelName.trim() });
      addToast('Channel created');
      setNewChannelModal(false);
      setNewChannelName('');
      const r = await messagesAPI.channels();
      setChannels(r.data?.results ?? r.data ?? []);
    } catch { addToast('Failed to create channel', 'error'); }
  };

  const currentName = activeView === 'dm'
    ? (selectedUser?.first_name ? `${selectedUser.first_name} ${selectedUser.last_name || ''}`.trim() : selectedUser?.username)
    : `# ${selectedChannel?.name}`;

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col card overflow-hidden">
        <div className="p-3 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Messages</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Channels */}
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Channels</span>
              <button onClick={() => setNewChannelModal(true)}
                className="text-slate-500 hover:text-indigo-400 transition-colors"><FiPlus size={13} /></button>
            </div>
            {channels.map(ch => (
              <button key={ch.id} onClick={() => loadChannel(ch)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  selectedChannel?.id === ch.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                }`}>
                <FiHash size={13} /> {ch.name}
              </button>
            ))}
          </div>

          {/* Direct Messages */}
          <div className="p-2">
            <div className="px-2 py-1.5 mb-1">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Direct Messages</span>
            </div>
            {users.map(u => (
              <button key={u.id} onClick={() => loadDM(u)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  selectedUser?.id === u.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                }`}>
                <div className="relative flex-shrink-0">
                  <Avatar user={u} size={6} />
                  <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-slate-800" />
                </div>
                <span className="truncate">
                  {u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {!selectedUser && !selectedChannel ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={FiMessageSquare} title="Select a conversation" description="Choose a channel or person to start messaging" />
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-3">
              {activeView === 'dm' ? (
                <><Avatar user={selectedUser} size={8} /><div><p className="text-sm font-semibold text-white">{currentName}</p>
                  <p className="text-xs text-emerald-400">Online</p></div></>
              ) : (
                <><div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center"><FiHash size={14} className="text-indigo-400" /></div>
                <div><p className="text-sm font-semibold text-white">{selectedChannel?.name}</p></div></>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full w-6 h-6 border-2 border-slate-600 border-t-indigo-500" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-12">No messages yet. Start the conversation!</div>
              ) : messages.map((msg, i) => {
                
                const isOwn = (msg.sender?.id ?? msg.sender_id) === user?.id;
                const prevMsg = messages[i - 1];
                const sameAuthor = prevMsg && (prevMsg.sender?.id ?? prevMsg.sender_id) === (msg.sender?.id ?? msg.sender_id);
                return (
                  <div key={msg.id} className={`flex items-end gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    {!sameAuthor && !isOwn && <Avatar user={msg.sender} size={7} />}
                    {(sameAuthor && !isOwn) && <div className="w-7 flex-shrink-0" />}
                    <div className={`max-w-xs lg:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!sameAuthor && !isOwn && (
                        <span className="text-xs text-slate-500 mb-1 ml-1">{msg.sender?.first_name || msg.sender?.username}</span>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isOwn ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-700 text-slate-200 rounded-bl-sm'
                      }`}>
                        {msg.content}
                      </div>
                      <span className="text-xs text-slate-600 mt-1 mx-1">
                        {msg.created_at ? new Date(msg.created_at * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-700">
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder={`Message ${currentName}…`}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
                <button type="submit" className="btn btn-primary px-3" disabled={!message.trim()}>
                  <FiSend size={15} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* New Channel Modal */}
      {newChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="modal-content bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">New Channel</h3>
              <button onClick={() => setNewChannelModal(false)} className="text-slate-400 hover:text-white"><FiX size={16} /></button>
            </div>
            <input className="input mb-4" placeholder="channel-name" value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)} autoFocus />
            <div className="flex gap-3 justify-end">
              <button className="btn btn-secondary" onClick={() => setNewChannelModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateChannel} disabled={!newChannelName.trim()}>
                <FiSave size={14} /> Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
