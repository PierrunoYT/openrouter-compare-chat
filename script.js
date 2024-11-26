// Available models from OpenRouter
class ChatUI {
    constructor() {
        this.messageContainer = document.getElementById('messagesContainer');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.modelCheckboxes = document.getElementById('modelCheckboxes');
        this.selectedModels = new Set();
        this.messages = [];
        this.apiKey = localStorage.getItem('openRouterApiKey');
        this.availableModels = [];

        this.initialize();
    }

    async initialize() {
        await this.fetchAvailableModels();
        this.createModelCheckboxes();
        this.setupEventListeners();
        this.checkApiKey();
    }

    async fetchAvailableModels() {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // Sort models by provider and name
            this.availableModels = data.data.sort((a, b) => {
                const providerA = a.id.split('/')[0];
                const providerB = b.id.split('/')[0];
                if (providerA !== providerB) {
                    return providerA.localeCompare(providerB);
                }
                return a.id.localeCompare(b.id);
            });
        } catch (error) {
            console.error('Error fetching models:', error);
            this.addError('Failed to fetch available models. Please refresh the page.');
        }
    }

    createModelCheckboxes() {
        this.modelCheckboxes.innerHTML = ''; // Clear existing checkboxes
        
        let currentProvider = '';
        this.availableModels.forEach(model => {
            const provider = model.id.split('/')[0];
            
            // Add provider header if it's a new provider
            if (provider !== currentProvider) {
                currentProvider = provider;
                const header = document.createElement('h3');
                header.className = 'provider-header';
                header.textContent = this.capitalizeProvider(provider);
                this.modelCheckboxes.appendChild(header);
            }

            const div = document.createElement('div');
            div.className = 'model-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = model.id;
            checkbox.value = model.id;
            
            const label = document.createElement('label');
            label.htmlFor = model.id;
            label.textContent = model.name || this.formatModelName(model.id);
            
            // Add model context window if available
            if (model.context_length) {
                const contextSpan = document.createElement('span');
                contextSpan.className = 'model-context';
                contextSpan.textContent = ` (${model.context_length.toLocaleString()} tokens)`;
                label.appendChild(contextSpan);
            }
            
            div.appendChild(checkbox);
            div.appendChild(label);
            this.modelCheckboxes.appendChild(div);
        });
    }

    capitalizeProvider(provider) {
        const specialCases = {
            'openai': 'OpenAI',
            'anthropic': 'Anthropic',
            'google': 'Google',
            'meta-llama': 'Meta/Llama',
            'mistralai': 'Mistral AI',
            'palm': 'PaLM'
        };
        return specialCases[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
    }

    formatModelName(modelId) {
        // Remove provider prefix and convert to title case
        const name = modelId.split('/')[1];
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        // Model selection listeners
        this.modelCheckboxes.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                if (e.target.checked) {
                    this.selectedModels.add(e.target.value);
                } else {
                    this.selectedModels.delete(e.target.value);
                }
            }
        });
    }

    checkApiKey() {
        if (!this.apiKey) {
            const key = prompt('Please enter your OpenRouter API key:');
            if (key) {
                this.apiKey = key;
                localStorage.setItem('openRouterApiKey', key);
            }
        }
    }

    async handleSend() {
        const userMessage = this.userInput.value.trim();
        if (!userMessage) return;
        if (this.selectedModels.size === 0) {
            alert('Please select at least one model');
            return;
        }

        // Disable input while processing
        this.setLoading(true);

        // Add user message to UI
        this.addMessage('user', userMessage);
        this.userInput.value = '';

        // Create message group for responses
        const messageGroup = document.createElement('div');
        messageGroup.className = 'message-group';

        // Send message to each selected model
        const promises = Array.from(this.selectedModels).map(modelId => 
            this.sendMessage(userMessage, modelId, messageGroup)
        );

        try {
            await Promise.all(promises);
        } catch (error) {
            console.error('Error sending messages:', error);
            this.addError('Failed to send messages to some models');
        }

        this.setLoading(false);
    }

    async sendMessage(message, modelId, messageGroup) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.href,
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: message }]
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const assistantMessage = data.choices[0].message.content;
            
            // Add assistant message to UI
            this.addModelResponse(modelId, assistantMessage, messageGroup);
        } catch (error) {
            console.error(`Error with model ${modelId}:`, error);
            this.addModelResponse(modelId, 'Error: Failed to get response', messageGroup, true);
        }
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        messageDiv.textContent = content;
        this.messageContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addModelResponse(modelId, content, messageGroup, isError = false) {
        const modelName = this.availableModels.find(m => m.id === modelId)?.name || modelId;
        
        const responseDiv = document.createElement('div');
        responseDiv.className = 'message assistant-message';
        if (isError) responseDiv.classList.add('error');

        const modelNameDiv = document.createElement('div');
        modelNameDiv.className = 'model-name';
        modelNameDiv.textContent = modelName;

        const contentDiv = document.createElement('div');
        contentDiv.textContent = content;

        responseDiv.appendChild(modelNameDiv);
        responseDiv.appendChild(contentDiv);
        messageGroup.appendChild(responseDiv);
        
        if (!this.messageContainer.contains(messageGroup)) {
            this.messageContainer.appendChild(messageGroup);
        }
        
        this.scrollToBottom();
    }

    addError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message error';
        errorDiv.textContent = message;
        this.messageContainer.appendChild(errorDiv);
        this.scrollToBottom();
    }

    setLoading(isLoading) {
        this.sendButton.disabled = isLoading;
        this.userInput.disabled = isLoading;
        this.sendButton.textContent = isLoading ? 'Sending...' : 'Send';
    }

    scrollToBottom() {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }
}

// Initialize the chat UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatUI();
});
