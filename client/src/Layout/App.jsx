import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from '../Pages/AuthPage.jsx'
import Home from '../Pages/Home.jsx'
import OTP from '../Pages/OTP.jsx'
import Attendance from '../Pages/Attendance.jsx'
import Navbar from '../Components/Navbar.jsx'
import Activity from '../Pages/Activity.jsx'
import ActivityDetail from '../Pages/ActivityDetail.jsx'
import Profile from '../Pages/Profile.jsx'
import ShareManage from '../Pages/ShareManage.jsx'
import ShareOTP from '../Pages/ShareOTP.jsx'
import AdminUsers from '../Pages/AdminUsers.jsx'
import Friends from '../Pages/Friends.jsx'
import Biometric from '../Pages/Biometric.jsx'
import Notifications from '../Pages/Notifications.jsx'
import Points from '../Pages/Points.jsx'
import { getCurrentUser, logoutUser } from '../api/auth.js'

function PrivateRoute({ children, isAuthenticated }) {
	return isAuthenticated ? children : <Navigate to="/auth" replace />
}

function AdminRoute({ children, isAuthenticated, isAdmin }) {
	if (!isAuthenticated) {
		return <Navigate to="/auth" replace />
	}

	return isAdmin ? children : <Navigate to="/" replace />
}

function Layout({ children, isAuthenticated, onLogout, isAdmin }) {
	return (
		<div className="app-container">
			{isAuthenticated && <Navbar onLogout={onLogout} isAdmin={isAdmin} />}
			<div className="app-content">
				{children}
			</div>
		</div>
	)
}

function App() {
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [isAdmin, setIsAdmin] = useState(false)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const hydrateSession = async () => {
			const token = localStorage.getItem('session_token')
			if (!token) {
				setIsAuthenticated(false)
				setIsAdmin(false)
				setLoading(false)
				return
			}

			try {
				const currentUser = await getCurrentUser()
				setIsAuthenticated(true)
				setIsAdmin(Boolean(currentUser.is_admin))
			} catch (err) {
				console.error('Session hydration error:', err)
				localStorage.removeItem('session_token')
				setIsAuthenticated(false)
				setIsAdmin(false)
			} finally {
				setLoading(false)
			}
		}

		hydrateSession()
	}, [])

	const handleAuthSuccess = () => {
		setLoading(true)
		getCurrentUser()
			.then((currentUser) => {
				setIsAuthenticated(true)
				setIsAdmin(Boolean(currentUser.is_admin))
			})
			.catch((err) => {
				console.error('Session hydration error:', err)
				setIsAuthenticated(true)
				setIsAdmin(false)
			})
			.finally(() => setLoading(false))
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
		<Layout isAuthenticated={isAuthenticated} onLogout={handleLogout} isAdmin={isAdmin}>
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
				<Route path="/activity/:id" element={
					<PrivateRoute isAuthenticated={isAuthenticated}>
						<ActivityDetail />
					</PrivateRoute>
				} />
				<Route path="/points" element={
					<PrivateRoute isAuthenticated={isAuthenticated}>
						<Points />
					</PrivateRoute>
				} />
				<Route path="/notifications" element={
					<PrivateRoute isAuthenticated={isAuthenticated}>
						<Notifications />
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
				<Route
					path="/profile"
					element={
						<PrivateRoute isAuthenticated={isAuthenticated}>
							<Profile />
						</PrivateRoute>
					}
				/>
				<Route
					path="/biometric"
					element={
						<PrivateRoute isAuthenticated={isAuthenticated}>
							<Biometric />
						</PrivateRoute>
					}
				/>
				<Route path="/friends" element={
					<PrivateRoute isAuthenticated={isAuthenticated}>
						<Friends />
					</PrivateRoute>
				} />
				<Route path="/share" element={
						<PrivateRoute isAuthenticated={isAuthenticated}>
							<ShareManage />
						</PrivateRoute>
					} />
				<Route
					path="/admin/users"
					element={
						<AdminRoute isAuthenticated={isAuthenticated} isAdmin={isAdmin}>
							<AdminUsers />
						</AdminRoute>
					}
				/>
					
				<Route path="/share/:token" element={<ShareOTP />} />

				<Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/auth"} replace />} />
			</Routes>
		</Layout>
	)
}

export default App
