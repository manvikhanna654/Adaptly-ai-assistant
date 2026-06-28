import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, addToast } = useApp();
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch (err) {
      addToast(err?.response?.data?.error || 'Login failed', 'error');
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const P = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    
    function handleResize() {
      resize();
      build();
    }
    window.addEventListener('resize', handleResize);

    function rnd(a, b) { return Math.random() * (b - a) + a; }

    class Dot {
      constructor() { this.init(); }
      init() {
        this.x = rnd(0, canvas.width);
        this.y = rnd(0, canvas.height);
        this.r = rnd(0.8, 2.2);
        this.a = rnd(0.2, 0.75);
        this.da = rnd(0.003, 0.009) * (Math.random() < .5 ? 1 : -1);
      }
      tick() {
        this.a += this.da;
        if (this.a > 0.8 || this.a < 0.1) this.da *= -1;
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.a;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    class Plus {
      constructor() { this.init(); }
      init() {
        this.x = rnd(0, canvas.width);
        this.y = rnd(0, canvas.height);
        this.sz = rnd(5, 15);
        this.a = rnd(0.2, 0.65);
        this.da = rnd(0.004, 0.011) * (Math.random() < .5 ? 1 : -1);
        this.rot = rnd(-0.4, 0.4);
        this.drot = rnd(0.0005, 0.0018) * (Math.random() < .5 ? 1 : -1);
        this.lw = rnd(1.1, 2.0);
      }
      tick() {
        this.a += this.da;
        if (this.a > 0.72 || this.a < 0.08) this.da *= -1;
        this.rot += this.drot;
      }
      draw() {
        const s = this.sz;
        ctx.save();
        ctx.globalAlpha = this.a;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = this.lw;
        ctx.lineCap = 'round';
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
        ctx.restore();
      }
    }

    class Star4 {
      constructor() { this.init(); }
      init() {
        this.x = rnd(0, canvas.width);
        this.y = rnd(0, canvas.height);
        this.sz = rnd(3, 9);
        this.a = rnd(0.15, 0.6);
        this.da = rnd(0.005, 0.013) * (Math.random() < .5 ? 1 : -1);
        this.rot = rnd(0, Math.PI * 2);
        this.drot = rnd(0.003, 0.009) * (Math.random() < .5 ? 1 : -1);
      }
      tick() {
        this.a += this.da;
        if (this.a > 0.65 || this.a < 0.05) this.da *= -1;
        this.rot += this.drot;
      }
      draw() {
        const s = this.sz;
        ctx.save();
        ctx.globalAlpha = this.a;
        ctx.fillStyle = '#fff';
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * .18, -s * .18, s, 0);
        ctx.quadraticCurveTo(s * .18, s * .18, 0, s);
        ctx.quadraticCurveTo(-s * .18, s * .18, -s, 0);
        ctx.quadraticCurveTo(-s * .18, -s * .18, 0, -s);
        ctx.fill();
        ctx.restore();
      }
    }

    function build() {
      P.length = 0;
      for (let i = 0; i < 60; i++) P.push(new Dot());
      for (let i = 0; i < 32; i++) P.push(new Plus());
      for (let i = 0; i < 14; i++) P.push(new Star4());
    }
    build();

    let animationFrameId;
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of P) { p.tick(); p.draw(); }
      animationFrameId = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="login-page-wrapper">
      <div className="bg-base"></div>

      <svg className="bg-svg" viewBox="0 0 1060 640" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="blur30"><feGaussianBlur stdDeviation="30"/></filter>
          <filter id="blur50"><feGaussianBlur stdDeviation="50"/></filter>
          <filter id="blur18"><feGaussianBlur stdDeviation="18"/></filter>
          <filter id="glow"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <ellipse cx="900" cy="55"  rx="200" ry="150" fill="rgba(255,253,255,0.6)"  filter="url(#blur50)"/>
        <ellipse cx="930" cy="40"  rx="120" ry="100" fill="rgba(255,255,255,0.55)" filter="url(#blur30)"/>
        <ellipse cx="960" cy="30"  rx="70"  ry="60"  fill="rgba(255,255,255,0.5)"  filter="url(#blur18)"/>
        <ellipse cx="70"  cy="570" rx="170" ry="130" fill="rgba(160,140,230,0.32)" filter="url(#blur50)"/>
        <ellipse cx="50"  cy="590" rx="90"  ry="75"  fill="rgba(140,120,215,0.25)" filter="url(#blur30)"/>
        <ellipse cx="780" cy="340" rx="90"  ry="70"  fill="rgba(200,185,255,0.18)" filter="url(#blur30)"/>
        <path d="M -60 330 Q 180 190 420 300 T 920 255" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" fill="none" filter="url(#glow)"/>
        <path d="M -30 410 Q 240 255 500 370 T 1090 310" stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" fill="none"/>
        <path d="M  80 530 Q 340 390 600 470 T 1110 410" stroke="rgba(255,255,255,0.13)" strokeWidth="1"   fill="none"/>
        <path d="M 610  -5 Q 760 160 700 325 T 810 610"  stroke="rgba(255,255,255,0.14)" strokeWidth="1"   fill="none"/>
        <path d="M 220 -10 Q 200 210 265 390 T 170 645"  stroke="rgba(255,255,255,0.10)" strokeWidth="1"   fill="none"/>
        <path d="M 350 -5  Q 420 150 380 350 T 450 640"  stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" fill="none"/>
      </svg>

      <canvas id="bgCanvas" ref={canvasRef}></canvas>

      <div className="layout">
        {/* LEFT: chat bubble */}
        <div className="chat-side">
          <div className="chat-bubble">
            <div className="hi">Hi there! 👋</div>
            I'm Aiva, your AI coach.<br/>
            I adapt to you, guide<br/>
            you, and help you<br/>
            <span className="goal">achieve your goals!</span>
          </div>
        </div>

        {/* CENTER: card */}
        <div className="card">
          <div className="adaptly-logo" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '26px' }}>
            <svg width="52" height="52" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M 24 82 L 50 20 L 76 82" stroke="url(#paint0_linear)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M 22 82 Q 50 48 78 82" stroke="url(#paint1_linear)" strokeWidth="22" strokeLinecap="round" opacity="0.95"/>
              <path d="M 50 55 Q 50 65 40 65 Q 50 65 50 75 Q 50 65 60 65 Q 50 65 50 55 Z" fill="#fff" opacity="0.95"/>
              <defs>
                <linearGradient id="paint0_linear" x1="50" y1="20" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#804cfc"/>
                  <stop offset="1" stopColor="#5522e6"/>
                </linearGradient>
                <linearGradient id="paint1_linear" x1="22" y1="65" x2="78" y2="65" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#b370ff"/>
                  <stop offset="1" stopColor="#ff9aee"/>
                </linearGradient>
              </defs>
            </svg>
            <span style={{ 
              fontFamily: "'Outfit', 'Plus Jakarta Sans', 'Nunito', sans-serif", 
              fontWeight: 800, 
              fontSize: '40px', 
              color: '#0e062e', 
              letterSpacing: '-0.02em', 
            }}>
              Adaptly
            </span>
          </div>
          
          <h1 style={{ fontSize: '24px', marginBottom: '8px', position: 'relative' }}>Welcome Back! <span className="sp" style={{top: '-2px', right: '-20px'}}>✦</span></h1>
          <p className="subtitle">
            Your <span className="ac">AI Adaptive Coach</span> is here to help<br/>
            you <span className="str">learn smarter, not harder.</span>
          </p>

          <form onSubmit={handleLogin} className="ig-form">
            <div className="ig">
              <svg className="il" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 7 10-7"/>
              </svg>
              <input 
                type="email" 
                placeholder="Email Address" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="ig">
              <svg className="il" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="11" width="18" height="11" rx="3"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input 
                type={showPassword ? "text" : "password"} 
                id="pwdInput" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="3" y1="3" x2="21" y2="21"/>
                  </svg>
                )}
              </button>
            </div>

            <a className="forgot" href="#">Forgot Password?</a>

            <button type="submit" className="btn-cta">Let's Continue <span style={{fontSize: '16px'}}>→</span></button>
          </form>

          <div className="divider"><span>Or continue with</span></div>

          <div className="social-row">
            <button className="sb">
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </button>
            <button className="sb">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.36.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            </button>
            <button className="sb">
              <svg width="20" height="20" viewBox="0 0 23 23">
                <path fill="#f25022" d="M0 0h11v11H0z"/>
                <path fill="#00a4ef" d="M12 0h11v11H12z"/>
                <path fill="#7fba00" d="M0 12h11v11H0z"/>
                <path fill="#ffb900" d="M12 12h11v11H12z"/>
              </svg>
            </button>
          </div>

          <div className="priv">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Your learning data is safe with us.
          </div>
          
          <p className="login-footer-text">
            New member? <Link to="/register" className="register-link">Register now</Link>
          </p>
        </div>

        {/* RIGHT: feature cards */}
        <div className="features-side">
          <div className="fc">
            <div className="fi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div><div className="ft">Personalized Plans</div><div className="fd">Plans that adapt to your strengths, weaknesses and pace.</div></div>
          </div>
          <div className="fc">
            <div className="fi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <div><div className="ft">Smart Insights</div><div className="fd">Get AI-powered insights to improve your performance.</div></div>
          </div>
          <div className="fc">
            <div className="fi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <polyline points="9 16 11 18 15 14"/>
              </svg>
            </div>
            <div><div className="ft">Stay on Track</div><div className="fd">Smart reminders and nudges to keep you consistent.</div></div>
          </div>
          <div className="fc">
            <div className="fi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                <path d="M4 22h16"/>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
              </svg>
            </div>
            <div><div className="ft">Achieve More</div><div className="fd">Small steps today, big results tomorrow.</div></div>
          </div>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="bar">
        <div className="bar-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <p>Not just a coach, your learning companion. Learn. Adapt. Improve. <span className="hl">Succeed.</span></p>
      </div>

    </div>
  );
}
