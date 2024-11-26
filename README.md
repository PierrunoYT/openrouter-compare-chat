# OpenRouter Chat

A web-based chat interface that allows you to interact with multiple AI models from OpenRouter simultaneously and compare their responses side by side.

## Features

- Dynamic fetching of all available models from OpenRouter
- Side-by-side comparison of responses from different models
- Models organized by provider
- Context window information display
- Clean and modern user interface
- Real-time responses
- Secure API key management

## Setup

1. Clone the repository:
```bash
git clone [your-repository-url]
cd openrouter-chat
```

2. Open `index.html` in your web browser.

3. When prompted, enter your OpenRouter API key. You can get one from [OpenRouter's website](https://openrouter.ai/).

## Usage

1. Select the models you want to compare from the model selection panel
2. Type your message in the input box
3. Press Enter or click Send
4. View the responses from each selected model side by side

## Security Note

The application stores your OpenRouter API key in the browser's localStorage. While this is convenient, please be aware of the security implications. For production use, consider implementing a backend server to handle API keys securely.

## Contributing

Feel free to open issues or submit pull requests if you have suggestions for improvements or find any bugs.

## License

MIT License - feel free to use this code for any purpose.
