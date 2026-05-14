import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import AuthPage from './Pages/AuthPage.jsx'
import Home from './Pages/Home.jsx'
import OTP from './Pages/OTP.jsx'
import Attendance from './Pages/Attendance.jsx'
import Navbar from './Components/Navbar.jsx'
import { logoutUser } from './api/auth.js'
import Activity from './Pages/Activity.jsx'

function PrivateRoute({ children, isAuthenticated }) {
	return isAuthenticated ? children : <Navigate to="/auth" replace />
}

function Layout({ children, isAuthenticated, onLogout }) {
	return (
		<div className="app-container">
			{isAuthenticated && <Navbar onLogout={onLogout} />}
			<div className="app-content">
				{children}
			</div>
		</div>
	)
}

function App() {
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [loading, setLoading] = useState(true)
	const location = useLocation()

	useEffect(() => {
		const token = localStorage.getItem('session_token')
		if (token) {
			setIsAuthenticated(true)
		}
		setLoading(false)
	}, [])

	const handleAuthSuccess = () => {
		setIsAuthenticated(true)
	}

	const handleLogout = async () => {
		try {
			await logoutUser()
		} catch (err) {
			console.error('Logout error:', err)
		} finally {
			localStorage.removeItem('session_token')
			setIsAuthenticated(false)
		}
	}

	if (loading) {
		return (
			<div className="loading-screen">
				<div className="spinner" />
				<p>Loading...</p>
			</div>
		)
	}

	return (
		<Layout isAuthenticated={isAuthenticated} onLogout={handleLogout}>
			<Routes>
				<Route 
					path="/auth" 
					element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage onAuthSuccess={handleAuthSuccess} />} 
				/>
				<Route
					path="/"
					element={
						<PrivateRoute isAuthenticated={isAuthenticated}>
							<Home />
						</PrivateRoute>
					}
				/>
				<Route
					path="/otp"
					element={
						<PrivateRoute isAuthenticated={isAuthenticated}>
							<OTP />
						</PrivateRoute>
					}
				/>
        <Route path="/activity" element={
          <PrivateRoute isAuthenticated={isAuthenticated}>
							<Activity />
					</PrivateRoute>
        } />

				<Route
					path="/attendance"
					element={
						<PrivateRoute isAuthenticated={isAuthenticated}>
							<Attendance />
						</PrivateRoute>
					}
				/>
				<Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/auth"} replace />} />
			</Routes>
		</Layout>
	)
}

export default App
