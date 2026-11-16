/* ==========================================================
   GD YouTube AI - CONFIG
   Sirf yahi file edit karni hai (2 cheezein zaruri):
   1) GOOGLE_CLIENT_ID      -> Google Cloud Console se (guide Step 3)
   2) APPS_SCRIPT_URL       -> Apps Script Web App URL (guide Step 2)
   ========================================================== */
(function (root) {
  var GD = {
    APP: {
      name: 'GD YouTube AI',
      short: 'GD YT AI',
      version: '1.0.0',
      tagline: 'Sirf Video Title do, poora YouTube Content Package pao',
      description:
        'AI se SEO titles, description, hashtags, keywords, 1280x720 thumbnail aur quiz - sab ek click me. Aapka data aapke apne Google Drive me.'
    },

    // ---- Setup values (guide me bataya gaya hai) ----
    GOOGLE_CLIENT_ID: '1061287154307-7vjhbmfhh8gs3egabsuav60o76cm3d1h.apps.googleusercontent.com',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyYNzC1la5QRCv03VkWxrFahkEvum_Zpe8b_6QVfEkXIjXRVOI88rpLH57YkbHCDSYh/exec',

    // ---- Google Drive storage (user ke apne Drive me) ----
    DRIVE_FOLDER_NAME: 'GD YouTube AI',
    DRIVE_SCOPES:
      'https://www.googleapis.com/auth/drive.file openid email profile',

    // ---- AI (Gemini free API) ----
    DEFAULT_MODEL: 'gemini-2.5-flash',
    FALLBACK_MODELS: ['gemini-2.5-flash-lite'],
    GET_KEY_URL: 'https://aistudio.google.com/apikey',

    // ---- Brand colours ----
    BRAND: {
      navy: '#0B1F4A',
      teal: '#00A8A8',
      amber: '#FFB703',
      hubUrl: 'https://sabbirtitagarh.github.io/hub/',
      poweredBy: 'Powered by GD TECH ACADEMY'
    },

    // ---- Owner details (https://gyaankadabba.blogspot.com se) ----
    OWNER: {
      name: 'Md. Sabbir',
      role: 'Digital Creator | Tech Tutor | Video Editor',
      brand: 'GD TECH ACADEMY',
      about: [
        'Passionate educator and digital creator dedicated to empowering the next generation of students and creators.',
        'Mission: complex tech concepts ko simple aur accessible banana, taaki har koi digital skills seekh sake.',
        'Technology ke saath-saath nature lover bhi - yahi connection teaching aur creativity ko inspire karta hai.'
      ],
      skills: [
        'Video Editing',
        'Graphic Design',
        'Web Development',
        'Content Creation',
        'Tech Training',
        'Digital Strategy'
      ],
      email: 'gdtechacademy119@gmail.com',
      phone: '+919339287525',
      phoneDisplay: '+91 93392 87525',
      whatsapp: 'https://wa.me/919339287525',
      location: 'Titagarh, Kolkata, West Bengal, India',
      website: 'https://gyaankadabba.blogspot.com',
      social: [
        { label: 'YouTube', icon: '▶️', url: 'https://www.youtube.com/@GDTACADEMY' },
        { label: 'Instagram', icon: '📸', url: 'https://www.instagram.com/gdtechacademy' },
        { label: 'Facebook', icon: '👍', url: 'https://www.facebook.com/@gdtclass' },
        { label: 'WhatsApp', icon: '💬', url: 'https://wa.me/919339287525' }
      ],
      links: [
        { label: 'Hire Me', url: 'https://sabbirhelp.blogspot.com/' },
        { label: 'Quiz Time', url: 'https://gdquizhub.blogspot.com/' },
        { label: 'Grab Your Place (Registration)', url: 'https://gdtechregistration.blogspot.com/' },
        { label: "Typing Karo", url: 'https://gdtyping.blogspot.com/' }
      ]
    }
  };
  root.GD = GD;
  if (typeof module !== 'undefined') module.exports = GD;
})(typeof window !== 'undefined' ? window : globalThis);
