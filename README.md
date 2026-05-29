# 📋 Smart Clipboard OCR (English & Thai)

A robust, decoupled, and high-performance full-stack web application designed to instantly capture and extract text from pasted or dragged images. It utilizes client-side pasting overlays and Node.js in-memory buffers (preventing disk writes for enhanced safety and speed) to execute OCR via Tesseract.js.

---

## ✨ Features

- **🚀 Instant Paste Interception**: Press `Ctrl+V` (or `Cmd+V`) anywhere on the application page to capture and process clipboard images.
- **🎨 Premium UX/UI Design**: High-end dark mode styled with Tailwind CSS v4, containing ambient neon glow highlights, backdrop glassmorphism cards, and sleek typography.
- **🔒 RAM-Safe Operations**: Integrates Multer memory storage (`multer.memoryStorage()`) in Express to process image data directly in-RAM, completely avoiding heavy and insecure disk I/O.
- **🇹🇭/🇬🇧 Dual-Language Engine**: Recognizes and extracts both English and Thai characters side-by-side or individually.
- **📈 Interactive Metrics Panel**: Renders OCR confidence percentages, precise word/character counters, and API processing speeds.
- **💾 Quick Output Utilities**: Copy extracted text with one click (includes animated check bubble alerts) or download text directly as a `.txt` file.
- **🧪 Interactive Dual-Lang Demo**: Generates a composite mock canvas to demo OCR character parsing in real-time, even if you do not have an image copied yet.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React (Vite)
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js
- **Server Framework**: Express.js
- **Middleware**: Multer (Memory Storage)
- **OCR Engine**: Tesseract.js

---

## 🚀 Setup & Installation

Follow these steps to run both systems locally in development mode:

### 1. Prerequisite
Ensure you have [Node.js](https://nodejs.org/) (version 18 or higher recommended) installed.

### 2. Clone the Repository
```bash
git clone https://github.com/Pond-cod/Clipboard_OCR.git
cd Clipboard_OCR
```

### 3. Start the Backend Server (Express)
```bash
cd backend
npm install
npm start
```
*The server will spin up on **[http://localhost:5000](http://localhost:5000)**.*

### 4. Start the Frontend Server (Vite)
Open a new terminal window in the root directory:
```bash
cd frontend
npm install
npm run dev
```
*The client dev dashboard will spin up on **[http://localhost:5173](http://localhost:5173)**.*

---

## 📸 Usage Tips

1. **Grab a Screenshot**: Press `Win + Shift + S` (Windows) or `Cmd + Shift + 4` (Mac) to capture any snippet of text.
2. **Paste & Parse**: Open `http://localhost:5173`, click anywhere on the interface, and press `Ctrl + V` (or `Cmd + V`).
3. **Download**: Once processed, you can copy the text or click "Save" to save it as a local text file.
