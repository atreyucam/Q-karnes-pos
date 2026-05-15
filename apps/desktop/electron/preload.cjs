const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('qkarnesRuntime', {
  apiBaseUrl: process.env.QKARNES_API_BASE_URL || 'http://127.0.0.1:4100'
});
