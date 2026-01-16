import { prisma } from "../config/db.js";
import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";

// Register a new user
const register = async (req, res) => {
    // Register a new user
    try {
        const { name, email, password } = req.body ?? {};

        if (!name || !email || !password) {
            return res.status(400).json({ error: "name, email and password are required" });
        }

        const userExists = await prisma.user.findUnique({
            where: { email },
        });

        if (userExists) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });

        // Generate web token
        const token = generateToken(user.id, res);

        // Return user data without password
        return res.status(201).json({
            status: "success",
            data: { user: { id: user.id, name: user.name, email: user.email }, token },
        });
    } catch (err) {
        console.error('Auth register error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Login user
const login = async (req, res) => {
    // Login user
    const { email, password } = req.body ?? {};

    if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
    }
    
    const user = await prisma.user.findUnique({
        where: { email: email },
    });

    if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate web token
    const token = generateToken(user.id, res);

    // Return user data without password
    return res.status(201).json({
        status: "success",
        data: { 
            user: { 
                id: user.id, 
                email: user.email },
        token, 
    },
    });
}

// Logout user
const logout = async (req, res) => {
    res.cookie('jwt', '', {
        expires: new Date(0),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 0,
    });
    return res.status(200).json({ status: "success", message: "Logged out successfully" });
};

export { register, login, logout };