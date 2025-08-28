# PromptGuide: An Analytical Toolkit for Prompt Evaluation and Refinement

*A Chrome Extension that provides metric-based feedback and AI-powered refinement to help you master prompt engineering.*

## Project Description

PromptGuide addresses a critical gap in prompt engineering: the lack of objective, systematic feedback. While prompt engineering has become essential for effective AI interactions, practitioners often rely on trial-and-error or subjective assessments. This tool introduces a hybrid architecture that combines deterministic evaluation with intelligent refinement.

The system features a two-stage approach: first, a local, rule-based engine provides immediate, metric-based scoring on criteria like clarity, specificity, and actionability. Then, a context-aware AI agent leverages this feedback to generate improved prompts tailored to specific refinement goals.

## How It Works

### Two-Stage User Workflow

**1. Evaluate**
Your prompt is first analyzed by a deterministic, metric-based engine that scores it across multiple dimensions:
- **Clarity**: How well-defined and unambiguous the prompt is
- **Specificity**: The level of detail and precision provided
- **Actionability**: How clear the expected output format and requirements are

**2. Refine**
After evaluation, you select a "Refinement Goal" (a gauntlet) that defines your improvement objective. The system then:
- Sends your original prompt, evaluation score, and feedback to a powerful LLM
- Generates a new, improved prompt that addresses the identified weaknesses
- Provides context-aware suggestions for further optimization

### User Interface Options

- **Proactive Mode**: Type in any text box on a webpage, pause, and the "Refine ✨" button appears for immediate refinement
- **Side Panel**: Click the extension icon for detailed analysis and manual prompt evaluation

## Technology Stack

### Backend
- **Python**: Core application logic and API development
- **Flask**: Lightweight web framework for RESTful API endpoints
- **NLTK**: Natural language processing and text analysis
- **textstat**: Readability and text complexity metrics
- **sentence-transformers**: Semantic similarity and embedding analysis
- **Groq API**: High-performance LLM integration for prompt refinement

### Frontend
- **Vanilla JavaScript**: Extension logic and DOM manipulation
- **HTML5**: Structure and semantic markup
- **CSS3**: Styling and responsive design
- **Chrome Extension APIs**: 
  - Side Panel API for detailed analysis interface
  - Storage API for user preferences and history
  - Messaging API for communication between components

## Project Structure

```
prompt-gauntlet-project/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   ├── services.py
│   │   └── evaluation_metrics.py
│   ├── run.py
│   └── requirements.txt
└── chrome-extension/
    ├── manifest.json
    ├── background.js
    ├── content_script.js
    ├── content_style.css
    ├── sidepanel.html
    ├── sidepanel.css
    └── sidepanel.js
```

## Setup and Installation

### Backend Setup

1. **Navigate to the backend directory**
   ```bash
   cd backend
   ```

2. **Create a Python virtual environment**
   ```bash
   python -m venv venv
   ```

3. **Activate the environment**
   
   **For Mac/Linux:**
   ```bash
   source venv/bin/activate
   ```
   
   **For Windows:**
   ```bash
   .\venv\Scripts\activate
   ```

4. **Install required dependencies**
   ```bash
   pip install -r requirements.txt
   ```

5. **Configure environment variables**
   
   Create a `.env` file in the backend directory and add your API key:
   ```
   API_KEY=your_api_key_here
   ```

6. **Start the server**
   ```bash
   python run.py
   ```

   The backend server will start on `http://localhost:5000`

### Frontend (Chrome Extension) Setup

1. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/` in Google Chrome

2. **Enable Developer Mode**
   - Toggle "Developer mode" in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `chrome-extension` folder from your project directory

4. **Verify Installation**
   - Ensure the extension appears in your extensions list
   - Pin it to the toolbar for easy access
   - Verify it is enabled and active

## How to Use

### Proactive Mode
1. Navigate to any webpage with text input fields
2. Start typing your prompt in any text box
3. Pause typing for a moment
4. The "Refine ✨" button will appear next to the text box
5. Click the button to get instant refinement suggestions

### Manual Mode
1. Click the PromptGuide extension icon in your Chrome toolbar
2. The side panel will open with detailed analysis tools
3. Paste or type your prompt in the evaluation area
4. Review the metric-based feedback
5. Select a refinement goal from the available gauntlets
6. Generate an improved version of your prompt


*Built with ❤️ for the prompt engineering community*
