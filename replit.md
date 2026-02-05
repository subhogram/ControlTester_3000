# Agent-Assess - AI Assessment Application

## Overview
Agent-Assess is a full-stack AI assessment application designed to facilitate advanced AI assessments. Its primary purpose is to provide dynamic model selection, unlimited file upload capabilities, and comprehensive vectorstore management. The application integrates with an external API for AI model management, knowledge base construction, vectorstore persistence, and chat functionalities. It enables users to perform AI control testing, regulatory compliance assessments, and engage in context-aware conversations with AI models.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach.
I want to be asked before any major architectural changes are made.
I prefer detailed explanations for complex solutions.
Do not make changes to the `DOCKER.md` file.
Do not make changes to the `.dockerignore` file.

## System Architecture

### Frontend
The frontend is built with React and TypeScript, utilizing Wouter for routing and TanStack Query (React Query v5) for efficient API data fetching. React Context is employed for chat state persistence. UI components are crafted using Shadcn UI and Radix UI, styled with Tailwind CSS, supporting dark mode.

### Backend
The backend is an Express.js application written in TypeScript. It handles file uploads using Multer with memory storage and acts as a proxy for specific endpoints to an external API running at `http://localhost:8000`.

### Key Features
-   **Dynamic Model Selection**: Models are dynamically populated from an external API, with selections persisted locally.
-   **Vectorstore Management**:
    -   **General Context (Global Knowledge Base)**: Allows uploading files to build a global knowledge base, which is automatically saved and loaded.
    -   **Company Policy Context**: Supports uploading company-specific policy documents to create a dedicated knowledge base, also with automatic saving and loading.
    -   **Chat Attachments**: Enables direct file uploads within the chat interface, creating a temporary, in-memory vectorstore for context-aware chat interactions.
-   **AI Control Testing**: Facilitates uploading YAML configuration files to run and assess AI control tests, with results display and export options.
-   **Regulatory Testing**: Offers two comparison modes with full API integration:
    -   **Regulation Comparison**: Compares multiple regulation documents via `POST /compare-regulations` API endpoint. Displays structured results including document frameworks, extracted controls, stringency analysis, and final reports.
    -   **RCM Comparison**: Assesses compliance by comparing regulation files with an RCM document.
    -   Results are displayed in a tabbed interface (Summary, Frameworks, Controls, Report) and can be exported as JSON or Markdown.
-   **Chat Functionality**: Provides real-time AI chat with file upload support, context-aware responses leveraging multiple vectorstores, and robust state persistence across navigation.

### Technical Implementations
-   **State Persistence**: Chat messages and uploaded files are maintained across page navigation using React Context. Other features like AI Control Testing and Regulatory Testing also utilize context for state management.
-   **File Uploads**: All file uploads use `FormData` for client-to-server communication.
-   **UI/UX**: The application features a responsive design with dark mode, dynamic input fields, and clear visual indicators for processes like vectorstore building.
-   **Build Automation**: Includes Docker support with multi-stage builds, `docker-compose.yml` for orchestration, and a `make.sh` script for streamlined development and deployment.

### File Structure
The project is organized with clear separation for `chat_attachments`, `saved_global_vectorstore`, `saved_company_vectorstore` directories. The `client/src` directory contains `types`, `hooks`, `pages`, `contexts`, and `components` for a modular frontend. The `server` directory includes `routes.ts` for backend API endpoints.

## External Dependencies

-   **External AI API**:
    -   URL: `http://localhost:8000` (configurable via `VITE_API_URL`)
    -   Functions: Provides services for model listing (`GET /models`), knowledge base construction (`POST /build-knowledge-base`), vectorstore persistence (`POST /save-vectorstore`), vectorstore loading (`POST /load-vectorstore`), and AI chat responses (`POST /chat`).
-   **Multer**: Used for handling multipart/form-data, primarily for file uploads in the backend.
-   **@tanstack/react-query**: Utilized in the frontend for server state management, data fetching, caching, and synchronization.
-   **Wouter**: A minimalist routing library used for client-side navigation in the React frontend.
-   **Express.js**: The core framework for building the backend server.
-   **Shadcn UI + Radix UI**: Provides accessible and customizable UI components for the frontend.
-   **Tailwind CSS**: A utility-first CSS framework for styling the application, including dark mode support.
-   **Drizzle ORM**: While schema is defined, it is currently using in-memory storage for database interactions.