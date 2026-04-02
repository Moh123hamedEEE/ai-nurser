import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs-extra";

dotenv.config();

const USERS_FILE = path.join(process.cwd(), "users.json");

// Initialize users file if it doesn't exist
async function initUsers() {
  if (!(await fs.pathExists(USERS_FILE))) {
    await fs.writeJson(USERS_FILE, [
      {
        username: "admin",
        password: "admin123",
        isDeveloper: true,
        status: "active"
      }
    ]);
  }
}

async function startServer() {
  await initUsers();
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Route for Login
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const users = await fs.readJson(USERS_FILE);
    
    const user = users.find((u: any) => u.username === username && u.password === password);
    
    if (user) {
      if (user.status === "inactive") {
        return res.status(403).json({ success: false, message: "هذا الحساب غير مفعل. يرجى التواصل مع المطور.", accountStatus: "inactive" });
      }
      res.json({
        success: true,
        username: user.username,
        isDeveloper: user.isDeveloper,
        accountStatus: user.status
      });
    } else {
      res.status(401).json({ success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }
  });

  // API Route for Creating Account (Developer Only)
  app.post("/api/create-account", async (req, res) => {
    const { developerUsername, newUsername, newPassword } = req.body;
    const users = await fs.readJson(USERS_FILE);

    const dev = users.find((u: any) => u.username === developerUsername && u.isDeveloper);
    if (!dev) {
      return res.status(403).json({ success: false, message: "غير مصرح لك بإنشاء حسابات" });
    }

    if (users.find((u: any) => u.username === newUsername)) {
      return res.status(400).json({ success: false, message: "اسم المستخدم موجود بالفعل" });
    }

    users.push({
      username: newUsername,
      password: newPassword,
      isDeveloper: false,
      status: "active"
    });

    await fs.writeJson(USERS_FILE, users);
    res.json({ success: true });
  });

  // API Route for Managing Account Status (Developer Only)
  app.post("/api/update-account-status", async (req, res) => {
    const { developerUsername, targetUsername, newStatus } = req.body;
    const users = await fs.readJson(USERS_FILE);

    const dev = users.find((u: any) => u.username === developerUsername && u.isDeveloper);
    if (!dev) {
      return res.status(403).json({ success: false, message: "غير مصرح لك" });
    }

    const userIndex = users.findIndex((u: any) => u.username === targetUsername);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    users[userIndex].status = newStatus;
    await fs.writeJson(USERS_FILE, users);
    res.json({ success: true });
  });

  // API Route for Listing All Accounts (Developer Only)
  app.get("/api/accounts", async (req, res) => {
    const { developerUsername } = req.query;
    const users = await fs.readJson(USERS_FILE);

    const dev = users.find((u: any) => u.username === developerUsername && u.isDeveloper);
    if (!dev) {
      return res.status(403).json({ success: false, message: "غير مصرح لك" });
    }

    // Return all users except passwords
    const safeUsers = users.map(({ password, ...rest }: any) => rest);
    res.json(safeUsers);
  });

  // API Route for Bulk Account Status Update (Developer Only)
  app.post("/api/bulk-update-account-status", async (req, res) => {
    const { developerUsername, targetUsernames, newStatus } = req.body;
    const users = await fs.readJson(USERS_FILE);

    const dev = users.find((u: any) => u.username === developerUsername && u.isDeveloper);
    if (!dev) {
      return res.status(403).json({ success: false, message: "غير مصرح لك" });
    }

    if (!Array.isArray(targetUsernames)) {
      return res.status(400).json({ success: false, message: "يجب إرسال قائمة بأسماء المستخدمين" });
    }

    let updatedCount = 0;
    const updatedUsers = users.map((u: any) => {
      if (targetUsernames.includes(u.username) && !u.isDeveloper) {
        updatedCount++;
        return { ...u, status: newStatus };
      }
      return u;
    });

    await fs.writeJson(USERS_FILE, updatedUsers);
    res.json({ success: true, updatedCount });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
