const nodemailer = require("nodemailer")
const otpStore = new Map() // In-memory store for OTPs (use Redis in production)

const OTP_EXPIRY_TIME = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 3

// Create transporter lazily so env vars are guaranteed to be loaded
let transporter = null
let lastEmailUser = null

const getTransporter = () => {
  const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER
  const emailPassword = (process.env.EMAIL_PASSWORD || process.env.GMAIL_PASSWORD || "").replace(/\s/g, "")

  // Recreate transporter if credentials changed
  if (transporter && lastEmailUser === emailUser) {
    return transporter
  }

  if (!emailUser || !emailPassword) {
    console.error("WARNING: Email credentials not configured!")
    console.error("Set EMAIL_USER and EMAIL_PASSWORD in your .env file")
    return null
  }

  // Auto-detect SMTP settings based on email domain
  const domain = emailUser.split("@")[1]?.toLowerCase() || ""

  let transportConfig

  if (domain === "gmail.com") {
    // Gmail
    transportConfig = {
      service: "gmail",
      auth: { user: emailUser, pass: emailPassword },
    }
  } else if (domain.includes("nu.edu.pk") || domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live.com")) {
    // NUCES / Microsoft Office 365 / Outlook
    transportConfig = {
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user: emailUser, pass: emailPassword },
      tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    }
  } else if (domain.includes("yahoo")) {
    // Yahoo
    transportConfig = {
      service: "yahoo",
      auth: { user: emailUser, pass: emailPassword },
    }
  } else {
    // Generic SMTP fallback — try common ports
    transportConfig = {
      host: `smtp.${domain}`,
      port: 587,
      secure: false,
      auth: { user: emailUser, pass: emailPassword },
      tls: { rejectUnauthorized: false },
    }
  }

  transporter = nodemailer.createTransport(transportConfig)
  lastEmailUser = emailUser
  console.log(`Email transporter configured for ${domain} with user: ${emailUser}`)
  return transporter
}

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Send OTP via email
const sendOTP = async (email, otp) => {
  // Always log OTP to console for development fallback
  console.log(`\n${"=".repeat(50)}`)
  console.log(`OTP for ${email}: ${otp}`)
  console.log(`Valid for 5 minutes`)
  console.log(`${"=".repeat(50)}\n`)

  try {
    const emailTransporter = getTransporter()

    if (!emailTransporter) {
      console.error("Email transporter not available - OTP logged to console only")
      return { sent: false, reason: "Email service not configured. Check EMAIL_USER and EMAIL_PASSWORD in .env" }
    }

    const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER

    const mailOptions = {
      from: `"Wombly" <${emailUser}>`,
      to: email,
      subject: "Wombly - Email Verification OTP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #FF69B4;">Welcome to Wombly!</h2>
          <p>Your One-Time Password (OTP) for email verification is:</p>
          <h1 style="color: #FF69B4; font-size: 32px; letter-spacing: 5px; text-align: center; 
              background: #FFF0F5; padding: 15px; border-radius: 10px;">${otp}</h1>
          <p>This OTP will expire in 5 minutes.</p>
          <p>If you did not request this verification, please ignore this email.</p>
          <hr style="border: 1px solid #FFB6C1;">
          <p style="color: #666; font-size: 12px;">Wombly - Your Pregnancy Care Companion</p>
        </div>
      `,
    }

    await emailTransporter.sendMail(mailOptions)
    console.log(`Email sent successfully to ${email}`)
    return { sent: true }
  } catch (error) {
    console.error("Error sending OTP email:", error.message)
    
    // Reset transporter on auth failure so it can be recreated with new creds
    transporter = null
    lastEmailUser = null
    
    // Provide specific error guidance
    if (error.message.includes("Username and Password not accepted")) {
      console.error("\n>>> GMAIL FIX: Your Gmail App Password is invalid or expired.")
      console.error(">>> 1. Go to https://myaccount.google.com/security")
      console.error(">>> 2. Enable 2-Step Verification if not enabled")
      console.error(">>> 3. Go to https://myaccount.google.com/apppasswords")
      console.error(">>> 4. Generate a new App Password for 'Mail'")
      console.error(">>> 5. Update EMAIL_PASSWORD in backend/.env with the new password\n")
    } else if (error.message.includes("SmtpClientAuthentication is disabled") || error.message.includes("5.7.139")) {
      console.error("\n>>> UNIVERSITY/OFFICE365 EMAIL: SMTP is disabled by your organization.")
      console.error(">>> Your university has blocked SMTP sending. Use a Gmail account instead:")
      console.error(">>> 1. Set EMAIL_USER=yourgmail@gmail.com in .env")
      console.error(">>> 2. Set EMAIL_PASSWORD=your_app_password in .env")
      console.error(">>> See: https://myaccount.google.com/apppasswords\n")
    } else if (error.message.includes("Invalid login")) {
      console.error("\n>>> EMAIL LOGIN FAILED: Check EMAIL_USER and EMAIL_PASSWORD in .env\n")
    }

    return { sent: false, reason: error.message }
  }
}

// Store OTP with expiry
const storeOTP = (email, otp) => {
  otpStore.set(email, {
    otp,
    expiry: Date.now() + OTP_EXPIRY_TIME,
    attempts: 0,
  })
}

// Verify OTP
const verifyOTP = (email, providedOTP) => {
  const otpData = otpStore.get(email)

  if (!otpData) {
    return { valid: false, message: "OTP not found. Please request a new one." }
  }

  // Check if OTP expired
  if (Date.now() > otpData.expiry) {
    otpStore.delete(email)
    return { valid: false, message: "OTP expired. Please request a new one." }
  }

  // Check attempts
  if (otpData.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(email)
    return { valid: false, message: "Maximum attempts exceeded. Please request a new OTP." }
  }

  // Check if OTP matches
  if (otpData.otp !== providedOTP) {
    otpData.attempts += 1
    return { valid: false, message: `Incorrect OTP. ${MAX_ATTEMPTS - otpData.attempts} attempts remaining.` }
  }

  // OTP is valid, delete it
  otpStore.delete(email)
  return { valid: true, message: "OTP verified successfully" }
}

// Resend OTP
const resendOTP = async (email) => {
  const newOTP = generateOTP()
  storeOTP(email, newOTP)
  const result = await sendOTP(email, newOTP)
  return { otp: newOTP, emailResult: result }
}

module.exports = {
  generateOTP,
  sendOTP,
  storeOTP,
  verifyOTP,
  resendOTP,
}
