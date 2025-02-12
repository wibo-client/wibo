import { createCanvas } from 'canvas';

class CaptchaGenerator {
  constructor() {
    this.width = 120;
    this.height = 40;
    this.codeLength = 4;
  }

  generate() {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    const code = this._generateCode();

    // 绘制背景
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, this.width, this.height);

    // 绘制干扰线
    this._drawLines(ctx);

    // 绘制验证码
    ctx.font = '28px Arial';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < code.length; i++) {
      ctx.fillStyle = this._randomColor();
      ctx.fillText(
        code[i],
        20 + i * 25,
        this.height / 2 + Math.random() * 8 - 4
      );
    }

    return {
      code,
      imageBuffer: canvas.toBuffer()
    };
  }

  _generateCode() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < this.codeLength; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  _randomColor() {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);
    return `rgb(${r},${g},${b})`;
  }

  _drawLines(ctx) {
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = this._randomColor();
      ctx.beginPath();
      ctx.moveTo(Math.random() * this.width, Math.random() * this.height);
      ctx.lineTo(Math.random() * this.width, Math.random() * this.height);
      ctx.stroke();
    }
  }
}

export default CaptchaGenerator;
