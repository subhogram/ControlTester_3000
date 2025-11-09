# Agent-Assess - AI Assessment Application

## Overview
Agent-Assess is a full-stack AI assessment application with dynamic model selection, unlimited file upload capabilities, and complete vectorstore management. The application integrates with an external API at `http://localhost:8000` for model management, knowledge base building, vectorstore persistence, and chat functionality.

## Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query v5)
- **UI Components**: Shadcn UI + Radix UI
- **Styling**: Tailwind CSS with dark mode support

### Backend
- **Framework**: Express.js with TypeScript
- **File Upload**: Multer with memory storage
- **External API**: Proxy to http://localhost:8000

## Key Features

### 1. Model Selection
- Dynamic model dropdown populated from external API `/models` endpoint
- Model selection persisted in localStorage
- Auto-loads vectorstores when model is selected in Settings

### 2. Vectorstore Management

#### General Context (Global Knowledge Base)
- Upload files to build global knowledge base
- Auto-saves to `global_kb_vectorstore/` folder
- Green "Vectorstore Ready" badge when available
- Auto-loads on Settings page when model is selected

#### Company Policy Context
- Upload files for company-specific knowledge
- Auto-saves to `company_kb_vectorstore/` folder
- Green "Vectorstore Ready" badge when available
- Auto-loads on Settings page when model is selected

#### Chat Attachments
- Upload files directly in chat window
- Builds `chat_attachment_vectorstore` on first message send
- Visual indicators:
  - "Processing..." badge while building vectorstore
  - Green "Ready" badge when vectorstore is built
  - Passed to chat API via `use_chat_attachments=true` parameter

### 3. Chat Functionality
- Real-time chat with AI models
- File upload support with drag-and-drop
- Context-aware responses using vectorstores
- Loading states and error handling
- Toast notifications for user feedback

## File Structure

### Key Directories
```
├── chat_attachments/          # Uploaded chat files
├── global_kb_vectorstore/     # General context vectorstore
├── company_kb_vectorstore/    # Company policy vectorstore
├── client/src/
│   ├── pages/
│   │   ├── chat.tsx           # Chat page with file upload
│   │   └── settings.tsx       # Model & vectorstore settings
│   └── components/
│       ├── ChatInput.tsx      # Chat input with file selector
│       ├── FileUploadBar.tsx  # File upload status bar
│       └── ContextFileUpload.tsx  # Vectorstore file upload
└── server/
    └── routes.ts              # API endpoints
```

## API Endpoints

### Internal Endpoints (Express)
- `GET /api/models` - Fetch available models
- `GET /api/vectorstore/:type` - Check vectorstore status
- `POST /api/vectorstore/save/:type` - Save vectorstore to disk
- `POST /api/vectorstore/load/:type` - Load vectorstore into memory
- `POST /api/chat` - Send chat message (proxies to external API)

### External API Integration (http://localhost:8000)
- `GET /models` - List available models
- `POST /build-knowledge-base` - Build knowledge base from uploaded files
  - Parameters: `files` (multipart), `selected_model`, `kb_type`, `batch_size`, `delay_between_batches`, `max_retries`
- `POST /save-vectorstore` - Persist vectorstore to disk
- `POST /load-vectorstore` - Load vectorstore into memory
- `POST /chat` - Chat with AI using loaded vectorstores
  - Request body (JSON): `{ selected_model, user_input, global_kb_path, company_kb_path, chat_kb_path }`
  - Response: `{ success, response, loaded_paths }`

## Data Flow

### Chat with Attachments
1. User uploads files in chat window
2. On first message send:
   - Frontend calls `http://localhost:8000/build-knowledge-base` directly
   - FormData parameters: `selected_model`, `kb_type=chat`, `batch_size=15`, `delay_between_batches=0.2`, `max_retries=3`, files
   - Creates `chat_attachment_vectorstore/` automatically
   - Shows "Processing..." badge
3. After vectorstore built:
   - Shows green "✓ Chat Attachments Ready" toast with stats
   - Shows green "Ready" badge in upload bar
   - Subsequent messages include `chat_kb_path=chat_attachment_vectorstore`
4. Chat API payload (sent to backend):
   ```json
   {
     "user_input": "user question",
     "selected_model": "model_name",
     "has_attachments": true  // triggers chat_kb_path inclusion
   }
   ```
5. Backend forwards to external API:
   ```json
   {
     "selected_model": "model_name",
     "user_input": "user question",
     "global_kb_path": "saved_global_vectorstore",
     "company_kb_path": "saved_company_vectorstore",
     "chat_kb_path": "chat_attachment_vectorstore"  // if has_attachments
   }
   ```
6. External API auto-loads all available vectorstores for context

### Vectorstore Building
All vectorstore builds use:
- `batch_size`: 15
- `delay_between_batches`: 0.2
- `max_retries`: 3

## Recent Changes (November 9, 2025)

### File Upload to Chat Integration
- ✅ Added file upload support to chat window
- ✅ Integrated `/build-knowledge-api` for chat attachments
- ✅ Created chat-attachment vectorstore functionality
- ✅ Added visual indicators (Processing/Ready badges)
- ✅ Pass `use_chat_attachments` flag to chat API

### Previous Features
- ✅ Removed delete vectorstore functionality
- ✅ Replaced FormData with URLSearchParams for API communication
- ✅ Implemented vectorstore auto-save to disk
- ✅ Created check endpoint with load-vectorstore API integration
- ✅ Added auto-loading functionality on Settings page
- ✅ Implemented green "Vectorstore Ready" status badges

## Environment Requirements

### External API
The application requires the external API running at `http://localhost:8000` for full functionality:
- Model management
- Knowledge base building
- Vectorstore persistence
- Chat responses

### Installed Packages
Key dependencies:
- `multer` + `@types/multer` - File upload handling
- `@tanstack/react-query` - Data fetching & caching
- `wouter` - Client-side routing
- `express` - Backend server
- `drizzle-orm` - Database ORM (schema defined, using in-memory storage)

## User Workflow

1. **Setup**
   - Start external API at `http://localhost:8000`
   - Navigate to Settings page
   - Select AI model from dropdown
   - Upload files to General Context and/or Company Policy
   - Vectorstores auto-save and auto-load

2. **Chat**
   - Navigate to Chat page
   - Optionally upload files for chat context
   - Send messages
   - First message with files triggers vectorstore build
   - Subsequent messages use built vectorstore
   - AI responds with context from all loaded vectorstores

## Technical Notes

- All file uploads use FormData for frontend-to-backend communication
- All external API calls use URLSearchParams (form-urlencoded)
- Vectorstores persist to disk and auto-load on page refresh
- Model selection required before chat/vectorstore operations
- Toast notifications provide user feedback for all operations
