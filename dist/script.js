class OpenRouterError extends Error {
    constructor(error) {
        super(error.message);
        this.code = error.code;
        this.metadata = error.metadata;
        this.name = 'OpenRouterError';
    }
}
class ChatUI {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.baseUrl = 'https://openrouter.ai/api/v1';
        this.messageContainer = document.getElementById('messagesContainer');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.modelCheckboxes = document.getElementById('modelCheckboxes');
        this.modelSearch = document.getElementById('modelSearch');
        this.darkModeToggle = document.getElementById('darkModeToggle');
        this.selectedModels = new Set();
        this.messages = [];
        this.apiKey = localStorage.getItem('openRouterApiKey');
        this.availableModels = [];
        this.currentStreamControllers = new Map();
        this.modelParameters = {
            temperature: 1.0,
            top_p: 1.0,
            top_k: 0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            repetition_penalty: 1.0,
            min_p: 0.0,
            top_a: 0.0
        };
        this.initialize();
    }
    async initialize() {
        await this.fetchAvailableModels();
        this.createModelCheckboxes();
        this.setupEventListeners();
        await this.checkApiKeyAndCredits();
        this.initializeTheme();
    }
    initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.darkModeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.darkModeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    async checkApiKeyAndCredits() {
        if (!this.apiKey) {
            const key = prompt('Please enter your OpenRouter API key:');
            if (key) {
                this.apiKey = key;
                localStorage.setItem('openRouterApiKey', key);
            }
        }
        if (this.apiKey) {
            try {
                const keyInfo = await this.fetchKeyInfo();
                if (keyInfo.data.limit !== null && keyInfo.data.usage >= keyInfo.data.limit) {
                    this.addError('Your API key has insufficient credits. Please add more credits to continue.');
                }
            }
            catch (error) {
                console.error('Error checking API key:', error);
                if (error instanceof OpenRouterError && error.code === 401) {
                    localStorage.removeItem('openRouterApiKey');
                    this.apiKey = null;
                    this.addError('Invalid API key. Please refresh and enter a valid key.');
                }
            }
        }
    }
    async fetchKeyInfo() {
        const response = await fetch(`${this.baseUrl}/auth/key`, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': window.location.href,
            }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new OpenRouterError(error.error);
        }
        return await response.json();
    }
    async fetchWithRetry(url, options, retries = this.maxRetries) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const error = await response.json();
                throw new OpenRouterError(error.error);
            }
            return response;
        }
        catch (error) {
            if (error instanceof OpenRouterError) {
                switch (error.code) {
                    case 401:
                        throw error; // Don't retry auth errors
                    case 402:
                        throw error; // Don't retry insufficient credits
                    case 429: // Rate limit
                        if (retries > 0) {
                            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                            return this.fetchWithRetry(url, options, retries - 1);
                        }
                        throw error;
                    case 502: // Model down
                    case 503: // No available provider
                        if (retries > 0) {
                            await new Promise(resolve => setTimeout(resolve, this.retryDelay * 2));
                            return this.fetchWithRetry(url, options, retries - 1);
                        }
                        throw error;
                }
            }
            throw error;
        }
    }
    async fetchAvailableModels() {
        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
                    'HTTP-Referer': window.location.href,
                }
            });
            const data = await response.json();
            this.availableModels = data.data.sort((a, b) => {
                const providerA = a.id.split('/')[0];
                const providerB = b.id.split('/')[0];
                if (providerA !== providerB) {
                    return providerA.localeCompare(providerB);
                }
                return a.id.localeCompare(b.id);
            });
        }
        catch (error) {
            console.error('Error fetching models:', error);
            if (error instanceof OpenRouterError) {
                this.addError(`Failed to fetch models: ${error.message}`);
            }
            else {
                this.addError('Failed to fetch available models. Please refresh the page.');
            }
        }
    }
    filterModels(searchTerm) {
        const normalizedSearch = searchTerm.toLowerCase();
        let currentProvider = '';
        let hasVisibleModelInProvider = false;
        this.modelCheckboxes.querySelectorAll('.provider-header, .model-checkbox').forEach((element) => {
            if (element.classList.contains('provider-header')) {
                if (currentProvider !== '') {
                    const prevHeader = this.modelCheckboxes.querySelector(`.provider-header[data-provider="${currentProvider}"]`);
                    if (prevHeader && !hasVisibleModelInProvider) {
                        prevHeader.classList.add('hidden');
                    }
                }
                currentProvider = element.dataset.provider || '';
                hasVisibleModelInProvider = false;
                return;
            }
            const checkbox = element.querySelector('input[type="checkbox"]');
            const label = element.querySelector('label');
            const modelName = label.textContent?.toLowerCase() || '';
            const modelId = checkbox.value.toLowerCase();
            const isVisible = modelName.includes(normalizedSearch) || modelId.includes(normalizedSearch);
            element.classList.toggle('hidden', !isVisible);
            if (isVisible) {
                hasVisibleModelInProvider = true;
            }
        });
        if (currentProvider !== '') {
            const lastHeader = this.modelCheckboxes.querySelector(`.provider-header[data-provider="${currentProvider}"]`);
            if (lastHeader && !hasVisibleModelInProvider) {
                lastHeader.classList.add('hidden');
            }
        }
    }
    createModelCheckboxes() {
        this.modelCheckboxes.innerHTML = '';
        let currentProvider = '';
        this.availableModels.forEach(model => {
            const provider = model.id.split('/')[0];
            if (provider !== currentProvider) {
                currentProvider = provider;
                const header = document.createElement('h3');
                header.className = 'provider-header';
                header.dataset.provider = provider;
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
        return provider
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    formatModelName(modelId) {
        const name = modelId.split('/')[1];
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    setupEventListeners() {
        this.darkModeToggle.addEventListener('click', () => this.toggleTheme());
        this.sendButton.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });
        this.modelSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            this.filterModels(searchTerm);
        });
        this.modelCheckboxes.addEventListener('change', (e) => {
            const target = e.target;
            if (target.type === 'checkbox') {
                if (target.checked) {
                    this.selectedModels.add(target.value);
                }
                else {
                    this.selectedModels.delete(target.value);
                }
            }
        });
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
            if (e.dataTransfer) {
                const files = Array.from(e.dataTransfer.files);
                const imageFiles = files.filter(file => file.type.startsWith('image/'));
                if (imageFiles.length > 0) {
                    await this.handleImageUpload(imageFiles[0]);
                }
            }
        });
        const parameterInputs = document.querySelectorAll('[data-param]');
        parameterInputs.forEach(input => {
            const param = input.dataset.param;
            input.addEventListener('change', () => {
                const value = parseFloat(input.value);
                if (!isNaN(value)) {
                    this.modelParameters[param] = value;
                }
            });
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
        }
        catch (error) {
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
        if (!userMessage)
            return;
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
        this.messages.push(message);
        this.addMessage('user', typeof message.content === 'string' ? message.content : 'Sent image with message: ' + message.content[0].text);
        const messageGroup = document.createElement('div');
        messageGroup.className = 'message-group';
        this.messageContainer.appendChild(messageGroup);
        this.cancelAllStreams();
        const promises = Array.from(this.selectedModels).map(modelId => this.streamResponse(message, modelId, messageGroup));
        try {
            await Promise.all(promises);
        }
        catch (error) {
            console.error('Error sending messages:', error);
            if (error instanceof OpenRouterError) {
                if (error.code === 403 && error.metadata) {
                    const moderationError = error.metadata;
                    this.addError(`Content moderation error: ${moderationError.reasons.join(', ')}. Flagged content: "${moderationError.flagged_input}"`);
                }
                else {
                    this.addError(`Error: ${error.message}`);
                }
            }
            else {
                this.addError('Failed to send messages to some models');
            }
        }
    }
    async streamResponse(message, modelId, messageGroup) {
        const controller = new AbortController();
        this.currentStreamControllers.set(modelId, controller);
        try {
            const preparedMessages = this.prepareMessagesWithCache(this.messages, modelId);
            const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.href,
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: preparedMessages,
                    stream: true,
                    ...this.modelParameters
                }),
                signal: controller.signal
            });
            const requestId = response.headers.get('x-request-id');
            if (requestId) {
                try {
                    const statsResponse = await this.fetchWithRetry(`${this.baseUrl}/generation/${requestId}`, {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'HTTP-Referer': window.location.href,
                        }
                    });
                    const stats = await statsResponse.json();
                    if (stats.data.cache_discount !== null) {
                        console.log(`Cache discount for ${modelId}: ${stats.data.cache_discount}`);
                        this.addCacheInfo(modelId, stats.data.cache_discount, messageGroup);
                    }
                }
                catch (error) {
                    console.error('Error fetching generation stats:', error);
                }
            }
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('Response body is null');
            const decoder = new TextDecoder();
            let responseDiv = this.createResponseDiv(modelId, messageGroup);
            let accumulatedResponse = '';
            let noContentRetries = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                let hasContent = false;
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            if (content) {
                                hasContent = true;
                                accumulatedResponse += content;
                                responseDiv.lastChild.textContent = accumulatedResponse;
                            }
                        }
                        catch (e) {
                            console.error('Error parsing stream:', e);
                        }
                    }
                }
                if (!hasContent) {
                    noContentRetries++;
                    if (noContentRetries >= 3) {
                        console.log(`No content received for ${modelId} after ${noContentRetries} attempts`);
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                else {
                    noContentRetries = 0;
                }
            }
            if (accumulatedResponse) {
                this.messages.push({
                    role: 'assistant',
                    content: accumulatedResponse
                });
            }
            else {
                throw new Error('No content generated');
            }
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('Stream cancelled for model:', modelId);
            }
            else {
                console.error(`Error with model ${modelId}:`, error);
                const errorMessage = error instanceof OpenRouterError ?
                    `Error: ${error.message}` :
                    'Error: Failed to get response';
                this.addModelResponse(modelId, errorMessage, messageGroup, true);
            }
        }
        finally {
            this.currentStreamControllers.delete(modelId);
        }
    }
    prepareMessagesWithCache(messages, modelId) {
        if (!modelId.startsWith('anthropic/')) {
            return messages;
        }
        return messages.map(msg => {
            if (typeof msg.content === 'string') {
                if (msg.content.length > 4096) {
                    return {
                        ...msg,
                        content: [
                            {
                                type: 'text',
                                text: msg.content,
                                cache_control: { type: 'ephemeral' }
                            }
                        ]
                    };
                }
                return msg;
            }
            return {
                ...msg,
                content: msg.content.map(content => {
                    if (content.type === 'text' && content.text && content.text.length > 4096) {
                        return {
                            ...content,
                            cache_control: { type: 'ephemeral' }
                        };
                    }
                    return content;
                })
            };
        });
    }
    addCacheInfo(modelId, cacheDiscount, messageGroup) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'cache-info';
        const discountPercent = (cacheDiscount * 100).toFixed(1);
        const isPositive = cacheDiscount > 0;
        infoDiv.textContent = `Cache ${isPositive ? 'savings' : 'cost'}: ${discountPercent}%`;
        infoDiv.style.color = isPositive ? '#4CAF50' : '#FF9800';
        messageGroup.appendChild(infoDiv);
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
        if (isError)
            responseDiv.classList.add('error');
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
document.addEventListener('DOMContentLoaded', () => {
    new ChatUI();
});
export {};
