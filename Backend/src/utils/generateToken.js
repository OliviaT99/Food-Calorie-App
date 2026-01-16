import jwt from "jsonwebtoken";

const generateToken = (userId, res) => {
    const payload = { id: userId };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d"});

    if (res && typeof res.cookie === 'function') {
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    }

    return token;
}

export default generateToken;