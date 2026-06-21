const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;
const DATA_FILE_PATH = path.join(app.getPath('userData'), 'badminton_tutor_data.json');

// Default initial state if data file doesn't exist
const DEFAULT_DATA = {
  settings: {
    apiKey: '',
    apiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash'
  },
  coachAvailability: {}, // { "Mon-08:00": true, ... }
  students: [],
  friends: [],
  captainHistory: [],
  trendHistory: [],
  friendsHistory: [],
  friendsAiOutput: ""
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 768,
    title: "Badminton Coach Assistant",
    backgroundColor: "#0d0e12",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  // Open devtools in development mode if needed
  // mainWindow.webContents.openDevTools();

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Load Data
ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const dataStr = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(dataStr);
      // Merge with default settings if missing
      if (!parsed.settings) parsed.settings = DEFAULT_DATA.settings;
      if (!parsed.settings.apiKey) parsed.settings.apiKey = DEFAULT_DATA.settings.apiKey;
      // Auto-migrate retired model
      if (parsed.settings.aiModel === 'gemini-1.5-flash') {
        parsed.settings.aiModel = 'gemini-2.5-flash';
      }
      return parsed;
    } else {
      // Create default file
      fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
      return DEFAULT_DATA;
    }
  } catch (error) {
    console.error("Error reading data file:", error);
    return DEFAULT_DATA;
  }
});

// IPC Handler: Save Data
ipcMain.handle('save-data', (event, data) => {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error("Error saving data file:", error);
    return { success: false, error: error.message };
  }
});

// Helper function to make HTTPS requests without external dependencies
function makeHttpsRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: 443
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => data,
          json: async () => {
            try {
              return JSON.parse(data);
            } catch (e) {
              throw new Error("Failed to parse JSON response: " + e.message + "\nResponse content: " + data);
            }
          }
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// IPC Handler: Call AI API
ipcMain.handle('call-ai', async (event, { provider, apiKey, model, prompt }) => {
  try {
    const key = apiKey || DEFAULT_DATA.settings.apiKey;
    if (provider === 'gemini') {
      const selectedModel = model || 'gemini-2.5-flash';
      // Use direct custom request to avoid native sdk and fetch dns issues
      const url = `https://generativelanguage.googleapis.com/v1/models/${selectedModel}:generateContent`;
      
      const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
      }

      const json = await response.json();
      if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
        return { success: true, text: json.candidates[0].content.parts[0].text };
      } else {
        throw new Error("Invalid structure returned from Gemini API");
      }
    } else if (provider === 'openai') {
      const selectedModel = model || 'gpt-4o-mini';
      const url = 'https://api.openai.com/v1/chat/completions';
      
      const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
      }

      const json = await response.json();
      if (json.choices && json.choices[0] && json.choices[0].message) {
        return { success: true, text: json.choices[0].message.content };
      } else {
        throw new Error("Invalid structure returned from OpenAI API");
      }
    } else if (provider === 'openrouter') {
      const selectedModel = model || 'google/gemini-2.5-flash:free';
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      
      const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://github.com/HoangKyAnh05/Tool_BadmintonTutor',
          'X-Title': 'Badminton Tutor Smart'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API Error (${response.status}): ${errText}`);
      }

      const json = await response.json();
      if (json.choices && json.choices[0] && json.choices[0].message) {
        return { success: true, text: json.choices[0].message.content };
      } else {
        throw new Error("Invalid structure returned from OpenRouter API");
      }
    } else {
      throw new Error(`Unknown AI Provider: ${provider}`);
    }
  } catch (error) {
    console.error("AI Request Failed:", error);
    return { success: false, error: error.message };
  }
});
