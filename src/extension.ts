import * as vscode from 'vscode';
import { getEnvConfig } from './envConfig';

let statusBarItem: vscode.StatusBarItem | undefined = undefined;

class CodingMusicViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'coding-music-player';
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
                    <h3>Error loading Music Player</h3>
                    <p>Failed to load the player interface. Please try refreshing.</p>
                    <button onclick="location.reload()">Refresh</button>
                </body>
                </html>
            `;
        }

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
        message => {
            console.log('[Extension] Received message:', message);

            switch (message.type) {
                case 'click':
                case 'openUrl':
                    if (message.url) {
                        try {
                            const url = new URL(message.url);
                            vscode.env.openExternal(vscode.Uri.parse(url.toString()));
                        } catch (error) {
                            vscode.window.showErrorMessage(`Invalid URL: ${message.url}`);
                        }
                    }
                    break;
                case 'info':
                    vscode.window.showInformationMessage(message.text);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(message.text);
                    break;
            }
        });
    }

    public refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public togglePlay() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'togglePlay' });
        }
    }

    private _getIframeSrc(): { url: string, iframeSrc: string } {
        const URL = this._customUrl || getEnvConfig().MUSIC_PLAYER_URL || '';
        return {
            url: URL,
            iframeSrc: URL, 
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; img-src https: data: vscode-resource:; media-src https: data: blob:; connect-src https: wss:;">
    <title>Coding Music Player</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #000;
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
    <iframe src="${this._getIframeSrc().iframeSrc}" title="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen ></iframe>
    
    <script>
        const vscode = acquireVsCodeApi();
        let isPlaying = true;

        // Message listener for Control commands
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'togglePlay') {
                const iframe = document.querySelector('iframe');
                if (iframe && iframe.contentWindow) {
                    const apiMessage = isPlaying ? 
                        {"event":"command","func":"pauseVideo","args":""} : 
                        {"event":"command","func":"playVideo","args":""};
                    
                    // Specific logic for YouTube API
                    iframe.contentWindow.postMessage(JSON.stringify(apiMessage), '*');
                    
                    // Log for debugging
                    console.log('Sending toggle to iframe, current state:', isPlaying);
                    isPlaying = !isPlaying;
                }
            }
        });
    </script>
</body>
</html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('🎵 Coding with Music extension is now active!');

    try {
        const provider = new CodingMusicViewProvider(context.extensionUri);

        const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
            CodingMusicViewProvider.viewType, 
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        context.subscriptions.push(viewProviderDisposable);

        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = "$(music) Coding Music";
        statusBarItem.tooltip = "Coding with Music Player";
        statusBarItem.show();

        const refreshCommand = vscode.commands.registerCommand('codingWithMusic.refreshPlayer', () => {
            provider.refresh();
        });

        const openPlayerCommand = vscode.commands.registerCommand('codingWithMusic.openPlayer', () => {
            vscode.commands.executeCommand('coding-music-player.focus');
        });

        const togglePlayCommand = vscode.commands.registerCommand('codingWithMusic.togglePlay', () => {
            provider.togglePlay();
        });

        let isPlayerVisible = true;
        const toggleVisibilityCommand = vscode.commands.registerCommand('codingWithMusic.toggleVisibility', () => {
            isPlayerVisible = !isPlayerVisible;
            if (isPlayerVisible) {
                vscode.commands.executeCommand('workbench.action.focusSideBar');
            } else {
                vscode.commands.executeCommand('workbench.action.closeSidebar');
            }
        });

        const changeUrlCommand = vscode.commands.registerCommand('codingWithMusic.changeUrl', async () => {
            const currentUrl = provider.getCustomUrl() || getEnvConfig().MUSIC_PLAYER_URL;
            let newUrl = await vscode.window.showInputBox({
                prompt: 'Enter a YouTube Link, SoundCloud Link, or any website',
                value: currentUrl,
                placeHolder: 'e.g. https://soundcloud.com/...'
            });
            
            if (newUrl) {
                // Auto-convert youtu.be links
                if (newUrl.includes('youtu.be/')) {
                    const id = newUrl.split('youtu.be/')[1].split('?')[0];
                    newUrl = `https://www.youtube.com/embed/${id}?enablejsapi=1`;
                } 
                else if (newUrl.includes('youtube.com/watch?v=')) {
                    const id = newUrl.split('v=')[1].split('&')[0];
                    newUrl = `https://www.youtube.com/embed/${id}?enablejsapi=1`;
                }
                
                provider.setCustomUrl(newUrl);
                vscode.window.showInformationMessage(`Music source updated!`);
            }
        });

        context.subscriptions.push(refreshCommand, openPlayerCommand, togglePlayCommand, toggleVisibilityCommand, changeUrlCommand, statusBarItem);

        console.log('✅ Coding with Music extension activated successfully');
    } catch (error) {
        console.error('❌ Failed to activate Coding with Music:', error);
    }
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
} 