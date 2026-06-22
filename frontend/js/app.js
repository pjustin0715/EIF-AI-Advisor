const API_URL = '';
        let accessToken = localStorage.getItem('access_token');
        let activeChatId = null;
        let pendingDeleteChatId = null;

        window.onload = async () => {
            if (accessToken) {
                document.getElementById('login-overlay').classList.add('hidden');
                await loadChats();
            }

            try {
                const res = await fetch('/auth/config');
                const config = await res.json();
                if (config.google_client_id) {
                    google.accounts.id.initialize({
                        client_id: config.google_client_id,
                        callback: handleCredentialResponse
                    });
                    google.accounts.id.renderButton(
                        document.getElementById("buttonDiv"),
                        { theme: "filled_black", size: "large", shape: "pill", text: "continue_with" }
                    );
                } else {
                    document.getElementById('login-error').innerText = "Google Client ID not configured.";
                }
            } catch (e) {
                console.error("Failed to load auth config", e);
                document.getElementById('login-error').innerText = "Failed to reach server.";
            }
        };

        // --- Auth Functions --- //

        async function handleCredentialResponse(response) {
            const errorDiv = document.getElementById('login-error');
            errorDiv.innerText = '';

            try {
                const res = await fetch(`${API_URL}/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential: response.credential })
                });

                if (res.ok) {
                    const data = await res.json();
                    accessToken = data.access_token;
                    localStorage.setItem('access_token', accessToken);
                    if (data.picture) {
                        localStorage.setItem('profile_picture', data.picture);
                    }

                    document.getElementById('login-overlay').classList.add('hidden');
                    await loadChats();
                } else {
                    const errorData = await res.json();
                    errorDiv.innerText = errorData.detail || 'Login failed';
                }
            } catch (err) {
                errorDiv.innerText = 'Network error connecting to server.';
            }
        }

        function logout() {
            accessToken = null;
            activeChatId = null;
            localStorage.removeItem('access_token');
            localStorage.removeItem('profile_picture');
            document.getElementById('login-overlay').classList.remove('hidden');
            document.getElementById('chatList').innerHTML = '';
            showEmptyState();
        }

        // --- Chat Management Functions --- //

        async function loadChats() {
            try {
                const res = await fetch(`${API_URL}/chats`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (res.ok) {
                    const chats = await res.json();
                    renderChatList(chats);
                    if (chats.length > 0 && !activeChatId) {
                        selectChat(chats[0].id);
                    } else if (chats.length === 0) {
                        showEmptyState();
                    }
                } else if (res.status === 401) {
                    logout();
                }
            } catch (e) {
                console.error('Failed to load chats', e);
            }
        }

        function renderChatList(chats) {
            const list = document.getElementById('chatList');
            list.innerHTML = '';
            chats.forEach(chat => {
                const div = document.createElement('div');
                div.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
                div.onclick = () => selectChat(chat.id);

                div.innerHTML = `
                    <span class="chat-title">${chat.title}</span>
                    <button class="delete-btn" onclick="deleteChat('${chat.id}', event)">✕</button>
                `;
                list.appendChild(div);
            });
        }

        let availableAdvisors = {};

        async function openNewChatModal() {
            document.getElementById('new-chat-title').value = '';
            const select = document.getElementById('new-chat-advisor');
            select.innerHTML = '<option value="">Loading advisors...</option>';
            document.getElementById('new-chat-modal').classList.remove('hidden');

            try {
                const res = await fetch(`${API_URL}/advisors`);
                if (res.ok) {
                    availableAdvisors = await res.json();
                    select.innerHTML = '';
                    for (const [id, adv] of Object.entries(availableAdvisors)) {
                        select.innerHTML += `<option value="${id}">${adv.name}</option>`;
                    }
                }
            } catch (e) {
                select.innerHTML = '<option value="advisor1">General</option>';
            }
        }

        function closeNewChatModal() {
            document.getElementById('new-chat-modal').classList.add('hidden');
        }

        async function submitNewChat() {
            const title = document.getElementById('new-chat-title').value.trim() || 'New Chat';
            const advisor_id = document.getElementById('new-chat-advisor').value;
            if (!advisor_id) return;

            closeNewChatModal();

            try {
                const res = await fetch(`${API_URL}/chats`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({ title, advisor_id })
                });
                if (res.ok) {
                    const newChat = await res.json();
                    await loadChats();
                    selectChat(newChat.id);
                }
            } catch (e) {
                console.error('Failed to create chat', e);
            }
        }

        async function deleteChat(id, event) {
            event.stopPropagation(); // Prevent selectChat from firing
            pendingDeleteChatId = id;
            document.getElementById('delete-chat-modal').classList.remove('hidden');
        }

        function closeDeleteChatModal() {
            pendingDeleteChatId = null;
            document.getElementById('delete-chat-modal').classList.add('hidden');
        }

        async function confirmDeleteChat() {
            const id = pendingDeleteChatId;
            if (!id) return;
            closeDeleteChatModal();

            try {
                const res = await fetch(`${API_URL}/chats/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (res.ok) {
                    if (activeChatId === id) {
                        activeChatId = null;
                        showEmptyState();
                    }
                    await loadChats();
                }
            } catch (e) {
                console.error('Failed to delete chat', e);
            }
        }

        async function selectChat(id) {
            activeChatId = id;
            document.getElementById('userInput').disabled = false;
            document.getElementById('sendBtn').disabled = false;

            // Re-render list to highlight active
            const items = document.querySelectorAll('.chat-item');
            items.forEach(item => {
                if (item.querySelector('.delete-btn').getAttribute('onclick').includes(id)) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            const chatbox = document.getElementById('chatbox');
            const chatboxInner = document.getElementById('chatbox-inner');
            chatboxInner.innerHTML = '<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';

            try {
                const res = await fetch(`${API_URL}/chats/${id}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const messages = data.messages;
                    const chatObj = data.chat;
                    chatboxInner.innerHTML = '';

                    // Fetch advisors to display name
                    if (Object.keys(availableAdvisors).length === 0) {
                        try {
                            const advRes = await fetch(`${API_URL}/advisors`);
                            if (advRes.ok) availableAdvisors = await advRes.json();
                        } catch (e) { }
                    }

                    let advisorName = "AI Advisor";
                    if (chatObj && chatObj.advisor_id && availableAdvisors[chatObj.advisor_id]) {
                        advisorName = availableAdvisors[chatObj.advisor_id].name;
                    }
                    document.getElementById('active-advisor-name').innerText = advisorName;

                    if (messages.length === 0) {
                        appendMessage('Hi! How can I assist you today?', 'ai');
                    } else {
                        messages.forEach(msg => {
                            appendMessage(msg.content, msg.role === 'user' ? 'user' : 'ai', false);
                        });
                        chatbox.scrollTop = chatbox.scrollHeight;
                    }
                }
            } catch (e) {
                console.error('Failed to load messages', e);
            }
        }

        function showEmptyState() {
            document.getElementById('chatbox-inner').innerHTML = '<div class="empty-chat">Select or create a chat to begin.</div>';
            document.getElementById('userInput').disabled = true;
            document.getElementById('sendBtn').disabled = true;
        }

        // --- Chat Interaction --- //

        function appendMessage(text, sender, autoScroll = true) {
            const chatboxInner = document.getElementById('chatbox-inner');
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message');

            const avatar = document.createElement('div');
            avatar.classList.add('avatar', sender);
            if (sender === 'user') {
                const pictureUrl = localStorage.getItem('profile_picture');
                if (pictureUrl) {
                    avatar.innerHTML = `<img src="${pictureUrl}" alt="User" style="width:100%;height:100%;border-radius:6px;object-fit:cover;">`;
                    avatar.style.background = 'transparent';
                } else {
                    avatar.innerText = 'U';
                }
            } else {
                avatar.innerText = 'AI';
            }

            const content = document.createElement('div');
            content.classList.add('message-content');

            if (typeof marked !== 'undefined') {
                content.innerHTML = marked.parse(text);
            } else {
                content.innerText = text;
            }

            msgDiv.appendChild(avatar);
            msgDiv.appendChild(content);
            chatboxInner.appendChild(msgDiv);

            if (autoScroll) {
                const chatbox = document.getElementById('chatbox');
                chatbox.scrollTop = chatbox.scrollHeight;
            }
        }

        function appendLoading() {
            const chatboxInner = document.getElementById('chatbox-inner');
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', 'message--loading');
            msgDiv.id = 'loading-indicator';

            const avatar = document.createElement('div');
            avatar.classList.add('avatar', 'ai');
            avatar.innerText = 'AI';

            const content = document.createElement('div');
            content.classList.add('message-content', 'message-content--loading');
            content.innerHTML = `
                <div class="loading">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            `;

            msgDiv.appendChild(avatar);
            msgDiv.appendChild(content);
            chatboxInner.appendChild(msgDiv);

            const chatbox = document.getElementById('chatbox');
            chatbox.scrollTop = chatbox.scrollHeight;
        }

        function removeLoading() {
            const loader = document.getElementById('loading-indicator');
            if (loader) loader.remove();
        }

        async function sendMessage() {
            if (!accessToken || !activeChatId) return;

            const inputField = document.getElementById('userInput');
            const text = inputField.value.trim();
            const btn = document.getElementById('sendBtn');

            if (!text) return;

            inputField.value = '';
            inputField.disabled = true;
            btn.disabled = true;

            appendMessage(text, 'user');
            appendLoading();

            try {
                const response = await fetch(`${API_URL}/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({ prompt: text, chat_id: activeChatId })
                });

                removeLoading();

                if (response.ok) {
                    const data = await response.json();
                    appendMessage(data.response, 'ai');
                } else if (response.status === 401) {
                    logout();
                } else {
                    const errorTxt = await response.text();
                    appendMessage('Error: ' + response.status + ' ' + errorTxt, 'ai');
                }
            } catch (error) {
                removeLoading();
                appendMessage('Network error: ' + error.message, 'ai');
            } finally {
                inputField.disabled = false;
                btn.disabled = false;
                inputField.focus();
            }
        }
