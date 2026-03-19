import * as vscode from 'vscode';
import { getEnvConfig } from './envConfig';

let statusBarItem: vscode.StatusBarItem | undefined = undefined;

class YouTubeMusicViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'youtube-music-player';
    private _view?: vscode.WebviewView;
    private _customUrl?: string;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public setCustomUrl(url: string) {
        this._customUrl = url;
        this.refresh();
    }

    public getCustomUrl(): string | undefined {
        return this._customUrl;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
            enableCommandUris: true,
            enableForms: true
        };

        try {
            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        } catch (error) {
            console.error('Failed to load webview HTML:', error);
            webviewView.webview.html = `
                <html>
                <body>
                    <h3>Error loading YouTube Music Player</h3>
                    <p>Failed to load the player interface. Please try refreshing.</p>
                    <button onclick="location.reload()">Refresh</button>
                </body>
                </html>
            `;
        }

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
        message => {
            console.log('[Extension] Received message from webview:', {
                type: message.type,
                message: message,
                timestamp: new Date().toISOString()
            });

            switch (message.type) {
                case 'info':
                    console.log('[Extension] Processing info message:', message.text);
                    if (message.text) {
                        vscode.window.showInformationMessage(`YouTube Music: ${message.text}`);
                        console.log('[Extension] ✅ Info message displayed successfully');
                    } else {
                        console.warn('[Extension] ❌ Info message missing text field');
                    }
                    break;
                case 'error':
                    console.log('[Extension] Processing error message:', message.text);
                    if (message.text) {
                        vscode.window.showErrorMessage(`YouTube Music Error: ${message.text}`);
                        console.log('[Extension] ✅ Error message displayed successfully');
                    } else {
                        console.warn('[Extension] ❌ Error message missing text field');
                    }
                    break;
                case 'warning':
                    console.log('[Extension] Processing warning message:', message.text);
                    if (message.text) {
                        vscode.window.showWarningMessage(`YouTube Music Warning: ${message.text}`);
                        console.log('[Extension] ✅ Warning message displayed successfully');
                    } else {
                        console.warn('[Extension] ❌ Warning message missing text field');
                    }
                    break;
                case 'nowPlaying':
                    console.log('[Extension] Processing nowPlaying message:', {
                        title: message.title,
                        artist: message.artist,
                        originalTitle: message.originalTitle
                    });
                    if (statusBarItem) {
                        // Use the title provided by iframe (already formatted with artist if available)
                        const displayText = message.title || (message.artist && message.originalTitle ? 
                            `${message.artist} - ${message.originalTitle}` : message.originalTitle || 'Unknown Track');
                        statusBarItem.text = `$(music) ${displayText}`;
                        statusBarItem.tooltip = `Now Playing: ${displayText}`;
                        console.log('[Extension] ✅ Status bar updated with:', displayText);
                    } else {
                        console.error('[Extension] ❌ Status bar item not available');
                    }
                    break;
                case 'stopped':
                    console.log('[Extension] Processing stopped message');
                    if (statusBarItem) {
                        statusBarItem.text = "$(music) YouTube Music";
                        statusBarItem.tooltip = "YouTube Music Player";
                        console.log('[Extension] ✅ Status bar reset to default');
                    } else {
                        console.error('[Extension] ❌ Status bar item not available');
                    }
                    break;
                case 'getConfig':
                    console.log('[Extension] Processing getConfig message');
                    try {
                        const currentConfig = vscode.workspace.getConfiguration('youtubeMusicStreamer');
                        const config = {
                            maxResults: currentConfig.get<number>('maxResults', 25),
                            region: currentConfig.get<string>('region', 'US')
                        };
                        webviewView.webview.postMessage({
                            type: 'config',
                            config: config
                        });
                        console.log('[Extension] ✅ Config sent to webview:', config);
                    } catch (error) {
                        console.error('[Extension] ❌ Failed to get/send config:', error);
                    }
                    break;
                case 'openSettings':
                    console.log('[Extension] Processing openSettings message');
                    try {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'youtubeMusicStreamer');
                        console.log('[Extension] ✅ Settings opened successfully');
                    } catch (error) {
                        console.error('[Extension] ❌ Failed to open settings:', error);
                    }
                    break;
                case 'click':
                case 'openUrl':
                    console.log('[Extension] Processing click/openUrl message:', {
                        url: message.url,
                        data: message
                    });
                    if (message.url) {
                        try {
                            // Validate URL format
                            const url = new URL(message.url);
                            console.log('[Extension] Opening URL in external browser:', url.toString());
                            
                            // Open URL in external browser
                            vscode.env.openExternal(vscode.Uri.parse(url.toString()));
                            console.log('[Extension] ✅ URL opened successfully in external browser');
                        } catch (error) {
                            console.error('[Extension] ❌ Invalid URL or failed to open:', {
                                url: message.url,
                                error: error
                            });
                            vscode.window.showErrorMessage(`YouTube Music: Invalid URL - ${message.url}`);
                        }
                    } else {
                        console.warn('[Extension] ❌ Click message missing URL field:', message);
                        vscode.window.showWarningMessage('YouTube Music: No URL provided for external link');
                    }
                    break;
                default:
                    console.warn('[Extension] ❌ Received unknown message type:', {
                        type: message.type,
                        message: message
                    });
                    break;
            }
            }
        );
    }

    public togglePlay() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'togglePlay' });
        }
    }

    public refresh() {
        if (this._view) {
            try {
                this._view.webview.html = this._getHtmlForWebview(this._view.webview);
            } catch (error) {
                console.error('Failed to refresh webview:', error);
                vscode.window.showErrorMessage('Failed to refresh YouTube Music Player');
            }
        }
    }
    private _getIframeSrc(): { url: string, iframeSrc: string } {
        const URL = this._customUrl || getEnvConfig().MUSIC_PLAYER_URL || '';
        const base = URL.includes('?') ? `${URL}&` : `${URL}?`;
        return {
            url: URL,
            iframeSrc: `${base}vscode=true&_t=${Date.now()}`, 
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; img-src https: data: vscode-resource:; media-src https: data: blob:; connect-src https: wss:;">
    <title>YouTube Music Player</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
        }
    </style>
</head>
<body>
    <iframe src="${this._getIframeSrc().iframeSrc}" allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen ></iframe>
    
    <script>
        // Get VS Code API
        const vscode = acquireVsCodeApi();
        
        console.log('[WebView Bridge] Initializing message bridge for YouTube Music extension');
        
        // Listen for messages from the iframe (your website)
        window.addEventListener('message', (event) => {
            console.log('[WebView Bridge] Received postMessage event:', {
                origin: event.origin,
                data: event.data,
                source: event.source === iframe?.contentWindow ? 'iframe' : 'other'
            });
            
            // Security: Verify the origin if needed
            // if (event.origin !== '${this._getIframeSrc().url}') {
            //     console.warn('[WebView Bridge] Message from unexpected origin:', event.origin);
            //     return;
            // }
            
            // Forward the message from iframe to VS Code extension
            if (event.data && event.data.type) {
                console.log('[WebView Bridge] ✅ Forwarding valid message to VS Code extension:', {
                    type: event.data.type,
                    data: event.data
                });
                vscode.postMessage(event.data);
            } else {
                console.log('[WebView Bridge] ❌ Ignoring invalid message (no type field):', event.data);
            }
        });
        
        // Log when iframe loads
        const iframe = document.querySelector('iframe');
        if (iframe) {
            iframe.onload = () => {
                console.log('[WebView Bridge] ✅ YouTube Music iframe loaded successfully');
            };
            iframe.onerror = (error) => {
                console.error('[WebView Bridge] ❌ Failed to load iframe:', error);
            };
        }
        
        console.log('[WebView Bridge] Message bridge setup complete');
    </script>
</body>
</html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('🎵 YouTube Music Streamer extension is now active!');

    try {
        const provider = new YouTubeMusicViewProvider(context.extensionUri);

        const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
            YouTubeMusicViewProvider.viewType, 
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        context.subscriptions.push(viewProviderDisposable);

        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = "$(music) YouTube Music";
        statusBarItem.tooltip = "YouTube Music Player in Sidebar";
        statusBarItem.show();

        const refreshCommand = vscode.commands.registerCommand('youtubeMusicStreamer.refreshPlayer', () => {
            provider.refresh();
        });

        const openPlayerCommand = vscode.commands.registerCommand('youtubeMusicStreamer.openPlayer', () => {
            vscode.commands.executeCommand('youtube-music-player.focus');
        });

        const changeUrlCommand = vscode.commands.registerCommand('youtubeMusicStreamer.changeUrl', async () => {
            const currentUrl = provider.getCustomUrl() || getEnvConfig().MUSIC_PLAYER_URL;
            const newUrl = await vscode.window.showInputBox({
                prompt: 'Enter a YouTube embed URL or website link',
                value: currentUrl,
                placeHolder: 'https://...'
            });
            if (newUrl) {
                provider.setCustomUrl(newUrl);
                vscode.window.showInformationMessage(`Music source updated!`);
            }
        });

        const togglePlayCommand = vscode.commands.registerCommand('youtubeMusicStreamer.togglePlay', () => {
            provider.togglePlay();
        });

        context.subscriptions.push(refreshCommand, openPlayerCommand, changeUrlCommand, togglePlayCommand, statusBarItem);

        console.log('✅ YouTube Music Streamer extension activated successfully');
    } catch (error) {
        console.error('❌ Failed to activate YouTube Music Streamer extension:', error);
        vscode.window.showErrorMessage(`Failed to activate YouTube Music Streamer: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
} 