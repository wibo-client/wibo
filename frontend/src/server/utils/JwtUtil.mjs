import jwt from 'jsonwebtoken';

class JwtUtil {
  constructor(secret = process.env.JWT_SECRET || 'your-secret-key') {
    this.secret = secret;
    this.expiresIn = '24h'; // Token有效期24小时
  }

  generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        username: user.username
      },
      this.secret,
      { expiresIn: this.expiresIn }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      return null;
    }
  }
}

export default JwtUtil;
