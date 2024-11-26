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
        this.currentStreamControllers = new Map(); // Store AbortControllers for streams

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

        // Handle file drops for images
        this.userInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.userInput.classList.add('dragover');
        });

        this.userInput.addEventListener('dragleave', () => {
            this.userInput.classList.remove('dragover');
        });

        this.userInput.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.userInput.classList.remove('dragover');

            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(file => file.type.startsWith('image/'));
            
            if (imageFiles.length > 0) {
                await this.handleImageUpload(imageFiles[0]);
            }
        });
    }

    async handleImageUpload(file) {
        try {
            const base64Image = await this.fileToBase64(file);
            const imageMessage = {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: this.userInput.value || "What's in this image?"
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: base64Image
                        }
                    }
                ]
            };
            
            await this.sendMessageToModels(imageMessage);
            this.userInput.value = '';
        } catch (error) {
            console.error('Error handling image:', error);
            this.addError('Failed to process image. Please try again.');
        }
    }

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async handleSend() {
        const userMessage = this.userInput.value.trim();
        if (!userMessage) return;
        if (this.selectedModels.size === 0) {
            alert('Please select at least one model');
            return;
        }

        const message = {
            role: 'user',
            content: userMessage
        };

        await this.sendMessageToModels(message);
        this.userInput.value = '';
    }

    async sendMessageToModels(message) {
        // Add user message to messages array and UI
        this.messages.push(message);
        this.addMessage('user', typeof message.content === 'string' ? message.content : 'Sent image with message: ' + message.content[0].text);

        // Create message group for responses
        const messageGroup = document.createElement('div');
        messageGroup.className = 'message-group';
        this.messageContainer.appendChild(messageGroup);

        // Cancel any existing streams
        this.cancelAllStreams();

        // Send message to each selected model
        const promises = Array.from(this.selectedModels).map(modelId => 
            this.streamResponse(message, modelId, messageGroup)
        );

        try {
            await Promise.all(promises);
        } catch (error) {
            console.error('Error sending messages:', error);
            this.addError('Failed to send messages to some models');
        }
    }

    async streamResponse(message, modelId, messageGroup) {
        const controller = new AbortController();
        this.currentStreamControllers.set(modelId, controller);

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
                    messages: this.messages,
                    stream: true,
                    temperature: 0.7
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let responseDiv = this.createResponseDiv(modelId, messageGroup);
            let accumulatedResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            accumulatedResponse += content;
                            responseDiv.lastChild.textContent = accumulatedResponse;
                        } catch (e) {
                            console.error('Error parsing stream:', e);
                        }
                    }
                }
            }

            // Add the complete message to our messages array
            this.messages.push({
                role: 'assistant',
                content: accumulatedResponse
            });

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Stream cancelled for model:', modelId);
            } else {
                console.error(`Error with model ${modelId}:`, error);
                this.addModelResponse(modelId, 'Error: Failed to get response', messageGroup, true);
            }
        } finally {
            this.currentStreamControllers.delete(modelId);
        }
    }

    cancelAllStreams() {
        for (const controller of this.currentStreamControllers.values()) {
            controller.abort();
        }
        this.currentStreamControllers.clear();
    }

    createResponseDiv(modelId, messageGroup) {
        const modelName = this.availableModels.find(m => m.id === modelId)?.name || modelId;
        
        const responseDiv = document.createElement('div');
        responseDiv.className = 'message assistant-message';

        const modelNameDiv = document.createElement('div');
        modelNameDiv.className = 'model-name';
        modelNameDiv.textContent = modelName;

        const contentDiv = document.createElement('div');
        contentDiv.textContent = '';

        responseDiv.appendChild(modelNameDiv);
        responseDiv.appendChild(contentDiv);
        messageGroup.appendChild(responseDiv);
        
        this.scrollToBottom();
        return responseDiv;
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

    checkApiKey() {
        if (!this.apiKey) {
            const key = prompt('Please enter your OpenRouter API key:');
            if (key) {
                this.apiKey = key;
                localStorage.setItem('openRouterApiKey', key);
            }
        }
    }
}

// Initialize the chat UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatUI();
});
