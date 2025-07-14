// Background script for ETA Invoice Exporter
class ETABackground {
    constructor() {
        this.init();
    }

    init() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.handleInstallation();
            }
        });

        // Handle messages from content scripts and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        // Handle tab updates to check if user is on ETA site
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.handleTabUpdate(tab);
            }
        });
    }

    handleInstallation() {
        // Set up initial storage
        chrome.storage.local.set({
            installDate: new Date().toISOString(),
            version: '1.0.0',
            usageCount: 0
        });

        // Show welcome notification (only if notifications permission is available)
        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'مُصدِّر الفواتير المجاني',
                message: 'تم تثبيت الإضافة بنجاح! انتقل إلى بوابة الفاتورة الإلكترونية لبدء الاستخدام.'
            });
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'checkTabUrl':
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    sendResponse({ 
                        isETASite: tab.url && tab.url.includes('invoicing.eta.gov.eg'),
                        url: tab.url 
                    });
                    break;

                case 'incrementUsage':
                    await this.incrementUsageCount();
                    sendResponse({ success: true });
                    break;

                case 'getUsageStats':
                    const stats = await this.getUsageStats();
                    sendResponse(stats);
                    break;

                case 'progressUpdate':
                    // Forward progress updates to popup if needed
                    // This allows content script to communicate progress to popup
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ error: error.message });
        }
    }

    handleTabUpdate(tab) {
        if (tab.url && tab.url.includes('invoicing.eta.gov.eg')) {
            // Update badge to show extension is active
            chrome.action.setBadgeText({
                tabId: tab.id,
                text: '✓'
            });
            
            chrome.action.setBadgeBackgroundColor({
                tabId: tab.id,
                color: '#10b981'
            });

            // Update title
            chrome.action.setTitle({
                tabId: tab.id,
                title: 'مُصدِّر الفواتير المجاني - جاهز للاستخدام'
            });
        } else {
            // Clear badge for non-ETA sites
            chrome.action.setBadgeText({
                tabId: tab.id,
                text: ''
            });

            chrome.action.setTitle({
                tabId: tab.id,
                title: 'مُصدِّر الفواتير المجاني'
            });
        }
    }

    async incrementUsageCount() {
        const result = await chrome.storage.local.get(['usageCount']);
        const newCount = (result.usageCount || 0) + 1;
        
        await chrome.storage.local.set({ 
            usageCount: newCount,
            lastUsed: new Date().toISOString()
        });

        // Show milestone notifications
        if (newCount === 1) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'أول تصدير ناجح!',
                message: 'تهانينا! تم تصدير أول ملف بنجاح.'
            });
        } else if (newCount === 10) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'مستخدم نشط!',
                message: 'رائع! لقد قمت بتصدير 10 ملفات بنجاح.'
            });
        }
    }

    async getUsageStats() {
        const result = await chrome.storage.local.get(['usageCount', 'installDate', 'lastUsed']);
        return {
            usageCount: result.usageCount || 0,
            installDate: result.installDate,
            lastUsed: result.lastUsed
        };
    }

    // Utility method to store data
    async storeData(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    // Utility method to get data
    async getData(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
            });
        });
    }
}

// Initialize background script
new ETABackground();