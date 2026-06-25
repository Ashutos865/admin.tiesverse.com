# Admin Control Center - Tiesverse

**🚨 CRITICAL SETUP UPDATES (Read before running locally) 🚨**
1. **Database Connection:** We have migrated to a Supabase PostgreSQL connection. You must ensure your `.env` file uses a URL-encoded password if your password contains special characters. Please refer to your team lead for the exact connection string format.
2. **Frontend Dependencies:** New dependencies have been added for the modal system and routing. Please run `npm install` inside the `frontend/` directory before starting the dev server.

This repository contains the central Admin Control Center for Tiesverse, managing three distinct portals:
1. **Tiesverse Portal**: Events, Articles, YouTube Videos, Workshops, Team, and Guests.
2. **Career Portal**: Position tracking, enrollments, and offer letters.
3. **Webinar Portal**: Managing upcoming events, webinar registrations, and calendar sync.
4. **Accounts Portal**: Authentication, Superuser staff management, and Role-Based Access Control (RBAC), and Theme Settings.

## Architecture

This project is built using a decoupled architecture:
- **Backend:** Django Rest Framework (DRF) serving JSON APIs via separate modular apps (`tiesverse_app`, `career_app`, `webinar_app`, `accounts_app`).
- **Frontend:** React + Vite utilizing a unified, premium dark-mode dashboard interface.
- **Authentication:** JSON Web Tokens (JWT) using `djangorestframework-simplejwt`.

## Features

- **Custom Authentication**: The default Django Admin is bypassed in favor of our sleek React dashboard. Users must log in via JWT to access the control center.
- **Role-Based Access**: 
  - Standard Staff members can access Tiesverse, Career, and Webinar data.
  - Superusers have exclusive access to the **Accounts Portal** to create new staff accounts and manage permissions.
- **Premium UI**: Built with vanilla CSS variables (`index.css`), lucide-react icons, and custom components (`Navbar`, `Sidebar`, `AdminLayout`).

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+

### Backend Setup (Django)
1. Navigate to the root directory and activate the virtual environment:
   ```bash
   .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
4. Create a superuser account (this is required to access the User Management portal on the frontend):
   ```bash
   python manage.py createsuperuser
   ```
5. Run the server:
   ```bash
   python manage.py runserver
   ```
   *The backend API will run on `http://127.0.0.1:8000/`.*

### Frontend Setup (React/Vite)
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:5173/`.*

## Logging In
When you open the frontend, you will be greeted by the Login page. 
Use the credentials you created via `createsuperuser` to log in. Once logged in, you can click on the "Users" tab in the top right to start adding other staff members!