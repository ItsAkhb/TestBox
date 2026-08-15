# TestBox

TestBox is a web application for creating, managing, and practicing test answer sheets.

The goal of TestBox is to provide a simple and fast way for students to organize their exams, track answers, mark important questions, and eventually sync their data across devices.

## Features

* Create and manage folders
* Create exams with custom question counts
* Generate and manage answer sheets
* Save answers and exam progress
* Mark important questions for review
* Add notes to exams
* Local data storage
* User authentication with Supabase
* Cloud sync infrastructure preparation
* Backup and restore support

## Tech Stack

* React
* Vite
* JavaScript (ES Modules)
* React Router
* Supabase

  * Authentication
  * Backend services
* GitHub Pages (Deployment)

## Project Structure

```
src/
├── components/     # Reusable UI components
├── context/        # Global state and providers
├── pages/          # Application pages
├── services/       # Storage, Supabase, and sync logic
├── assets/         # Images and static files
├── App.jsx
└── main.jsx
```

## Development

Clone the repository:

```bash
git clone https://github.com/ItsAkhb/TestBox.git
```

Go to the project folder:

```bash
cd TestBox
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build the production version:

```bash
npm run build
```

## Deployment

TestBox is currently deployed using GitHub Pages.

To deploy a new version:

```bash
npm run deploy
```

## Environment Variables

Create a `.env.local` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

Never commit environment files or private keys to the repository.

## Current Status

TestBox is currently in active development.

Implemented:

* Core exam and folder management
* Local storage system
* Authentication system
* GitHub Pages deployment
* Supabase connection

Planned:

* Complete cloud synchronization
* Multi-device data sync
* Improved mobile experience
* Advanced statistics and analytics

## License

This project is currently a personal project and is not licensed for redistribution.
