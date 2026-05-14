import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

function Navbar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    setMobileMenuOpen(false);
    await onLogout();
    navigate('/auth');
  };

  const handleNavClick = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/otp', label: 'OTP' },
    { path: '/attendance', label: 'Attendance' },
    { path: '/activity', label: 'Activity' },
    { path: '/profile', label: 'Profile' },
    { path: '/share', label: 'Share' },
  ];

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-brand">
            PCDP
          </Link>

          {/* Desktop Menu */}
          <ul className="navbar-menu desktop">
            {navItems.map((item) => (
              <li key={item.path}>
                <button
                  className={`navbar-link${isActive(item.path) ? ' active' : ''}`}
                  onClick={() => handleNavClick(item.path)}
                >
                  {item.label}
                </button>
              </li>
            ))}
            <li>
              <button
                className="navbar-logout"
                onClick={() => setShowLogoutConfirm(true)}
              >
                Logout
              </button>
            </li>
          </ul>

          {/* Hamburger Button */}
          <button
            className="hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`} />
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`} />
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`} />
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="navbar-menu-mobile">
            <ul>
              {navItems.map((item) => (
                <li key={item.path}>
                  <button
                    className={`navbar-link-mobile${isActive(item.path) ? ' active' : ''
                      }`}
                    onClick={() => handleNavClick(item.path)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  className="navbar-logout-mobile"
                  onClick={() => {
                    setShowLogoutConfirm(true);
                    setMobileMenuOpen(false);
                  }}
                >
                  Logout
                </button>
              </li>
            </ul>
          </div>
        )}
      </nav>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p>Sign out of this session?</p>
            <div className="modal-buttons">
              <button
                className="modal-btn cancel"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={confirmLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;