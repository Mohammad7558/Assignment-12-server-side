# 📚 Collaborative Study Platform - Backend Server

This is the backend server for the Collaborative Study Platform — a role-based web application supporting **Admin**, **Tutor**, and **Student** users with JWT authentication and cookie-based sessions.

---

## 🚀 Features

### 👑 Admin Capabilities
- View all registered users and change their roles dynamically.
- Manage all study sessions:
  - Approve or reject sessions.
  - Provide feedback on sessions.
  - Update or delete any session.
  - Set sessions as free or paid.
- Manage study materials:
  - View all materials.
  - Edit or delete materials.

### 🧑‍🏫 Tutor Capabilities
- Create new study sessions.
- View all own sessions with status (Pending, Approved, Rejected).
- Upload study materials.
- View uploaded materials.
- See feedback on rejected sessions and request approval again.

### 🎓 Student Capabilities
- View booked sessions.
- Create personal study notes.
- Edit or delete own notes.
- Download study materials uploaded by tutors.

---

## 🔐 Authentication & Security

- **JWT-based authentication** using HTTP-only cookies for secure session management.
- Role-based access control (RBAC) enforced on protected routes.
- Secure cookie settings for cross-origin usage (e.g., `secure: true`, `sameSite: 'None'`).

---

## 🛠️ Technology Stack

- **Node.js** with **Express.js** for REST API server.
- **MongoDB** for database storage.
- **JWT (jsonwebtoken)** for token generation and verification.
- **cookie-parser** for handling cookies.
- **CORS** middleware with `credentials: true` for cross-origin requests.
- Environment variables management with **dotenv**.
- Server adapted for deployment on **Vercel** as serverless functions using **serverless-http**.

---

## 📂 Project Structure (Backend)

