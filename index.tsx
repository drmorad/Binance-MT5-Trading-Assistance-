// FIX: Removed invalid file delimiter from the top of the file.
import { GoogleGenAI, Chat } from "@google/genai";
import { marked } from "marked";

const CHAT_HISTORY_KEY = 'chat_history';

// Per instructions, API key is in process.env.API_KEY.
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    console.error("API_KEY is not set in environment variables.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY! });

const systemInstruction = `You are an expert MQL5 developer and a senior financial analyst for Binance on MetaTrader 5. 

When you generate MQL5 code, you MUST follow it with a detailed explanation. This explanation should include: 
1. A summary of the overall logic. 
2. A breakdown of each function, explaining its purpose and parameters. 
3. A discussion of potential edge cases (e.g., high volatility, broker errors). 
4. Suggestions for improvements or alternative approaches. 
5. A dedicated "Backtesting Guide" section with clear, step-by-step instructions on how to set up and run the generated Expert Advisor in MetaTrader 5's Strategy Tester.
Format the code in a markdown code block with the language 'mql5'.

When asked for market analysis, news summaries, or economic events, you must act as a senior financial analyst, leveraging up-to-the-minute information to provide insightful and accurate summaries.`;

// --- Data Layer ---
interface TickerData {
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
}

class MarketDataService {
    private readonly API_ENDPOINT = 'https://api.binance.com/api/v3/ticker/24hr';
    private readonly SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
    private onUpdate: (data: TickerData[]) => void;
    private onError: (error: Error) => void;

    constructor(onUpdate: (data: TickerData[]) => void, onError: (error: Error) => void) {
        this.onUpdate = onUpdate;
        this.onError = onError;
    }

    public start(interval: number = 5000): void {
        this.fetchTickerData();
        setInterval(() => this.fetchTickerData(), interval);
    }

    private async fetchTickerData(): Promise<void> {
        const url = `${this.API_ENDPOINT}?symbols=${JSON.stringify(this.SYMBOLS)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            const data: TickerData[] = await response.json();
            this.onUpdate(data);
        } catch (error) {
            console.error('PriceStreamService: Error fetching ticker data.', error);
            this.onError(error as Error);
        }
    }
}


// --- UI Layer ---
class TradingAssistantApp {
    private chat: Chat;
    private marketDataService: MarketDataService;
    
    // DOM Elements
    private chatContainer: HTMLElement;
    private promptForm: HTMLFormElement;
    private promptInput: HTMLTextAreaElement;
    private submitButton: HTMLButtonElement;
    private clearHistoryButton: HTMLButtonElement;
    private printPdfButton: HTMLButtonElement;
    private headerButtons: NodeListOf<HTMLButtonElement>;
    private marketTickerContainer: HTMLElement;

    // Strategy Builder Elements
    private strategyBuilderModal: HTMLDialogElement;
    private openStrategyBuilderButton: HTMLButtonElement;
    private closeStrategyBuilderButton: HTMLButtonElement;
    private cancelStrategyBuilderButton: HTMLButtonElement;
    private strategyBuilderForm: HTMLFormElement;
    private indicatorsContainer: HTMLElement;
    private addIndicatorButton: HTMLButtonElement;
    private entryConditionsContainer: HTMLElement;
    private exitConditionsContainer: HTMLElement;
    private addEntryConditionButton: HTMLButtonElement;
    private addExitConditionButton: HTMLButtonElement;
    private indicatorRowTemplate: HTMLTemplateElement;
    private conditionRowTemplate: HTMLTemplateElement;

    constructor() {
        // Chat elements
        this.chatContainer = document.getElementById('chat-container')!;
        this.promptForm = document.getElementById('prompt-form') as HTMLFormElement;
        this.promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
        this.submitButton = this.promptForm.querySelector('button[type="submit"]') as HTMLButtonElement;
        
        // Header elements
        this.clearHistoryButton = document.getElementById('clear-history-button') as HTMLButtonElement;
        this.printPdfButton = document.getElementById('print-pdf-button') as HTMLButtonElement;
        this.headerButtons = document.querySelectorAll('.header-button-primary');
        this.marketTickerContainer = document.getElementById('market-ticker-container')!;

        // Strategy Builder Elements
        this.strategyBuilderModal = document.getElementById('strategy-builder-modal') as HTMLDialogElement;
        this.openStrategyBuilderButton = document.getElementById('strategy-builder-button') as HTMLButtonElement;
        this.closeStrategyBuilderButton = document.getElementById('close-builder-button') as HTMLButtonElement;
        this.cancelStrategyBuilderButton = document.getElementById('cancel-builder-button') as HTMLButtonElement;
        this.strategyBuilderForm = document.getElementById('strategy-builder-form') as HTMLFormElement;
        this.indicatorsContainer = document.getElementById('indicators-container')!;
        this.addIndicatorButton = document.getElementById('add-indicator-button') as HTMLButtonElement;
        this.entryConditionsContainer = document.getElementById('entry-conditions-container')!;
        this.exitConditionsContainer = document.getElementById('exit-conditions-container')!;
        this.addEntryConditionButton = this.strategyBuilderForm.querySelector('.add-entry-condition') as HTMLButtonElement;
        this.addExitConditionButton = this.strategyBuilderForm.querySelector('.add-exit-condition') as HTMLButtonElement;
        this.indicatorRowTemplate = document.getElementById('indicator-row-template') as HTMLTemplateElement;
        this.conditionRowTemplate = document.getElementById('condition-row-template') as HTMLTemplateElement;

        // AI Chat Initialization
        this.chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
            history: this.loadHistory(),
        });

        // Market Data Service Initialization
        this.marketDataService = new MarketDataService(
            (data) => this.updateMarketDataUI(data),
            (error) => this.handleMarketDataError(error)
        );

        this.init();
    }

    private init(): void {
        this.renderHistory();
        this.marketDataService.start();

        // Core Event Listeners
        this.promptForm.addEventListener('submit', (e) => this.handlePromptSubmit(e));
        this.clearHistoryButton.addEventListener('click', () => this.clearHistory());
        this.printPdfButton.addEventListener('click', () => this.printChat());
        this.headerButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleHeaderAction(e));
        });
        
        // Strategy Builder Event Listeners
        this.openStrategyBuilderButton.addEventListener('click', () => this.strategyBuilderModal.showModal());
        this.closeStrategyBuilderButton.addEventListener('click', () => this.strategyBuilderModal.close());
        this.cancelStrategyBuilderButton.addEventListener('click', () => this.strategyBuilderModal.close());
        this.addIndicatorButton.addEventListener('click', () => this.addIndicatorRow());
        this.addEntryConditionButton.addEventListener('click', () => this.addConditionRow(this.entryConditionsContainer));
        this.addExitConditionButton.addEventListener('click', () => this.addConditionRow(this.exitConditionsContainer));
        this.strategyBuilderForm.addEventListener('submit', (e) => this.handleStrategySubmit(e));

        // Auto-resize textarea
        this.promptInput.addEventListener('input', () => {
            this.promptInput.style.height = 'auto';
            this.promptInput.style.height = `${this.promptInput.scrollHeight}px`;
        });
        
        // Add initial rows to builder
        this.addIndicatorRow();
        this.addConditionRow(this.entryConditionsContainer);
    }

    // --- Market Data Methods ---
    private updateMarketDataUI(data: TickerData[]): void {
        this.marketTickerContainer.innerHTML = ''; // Clear previous data
        data.forEach(ticker => {
            const card = document.createElement('div');
            card.className = 'ticker-card';

            const pair = document.createElement('div');
            pair.className = 'ticker-pair';
            const formattedSymbol = `${ticker.symbol.slice(0, -4)}/${ticker.symbol.slice(-4)}`;
            pair.textContent = formattedSymbol;

            const price = document.createElement('div');
            price.className = 'ticker-price';
            price.textContent = parseFloat(ticker.lastPrice).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });

            const change = document.createElement('div');
            const changeValue = parseFloat(ticker.priceChangePercent);
            change.className = `ticker-change ${changeValue >= 0 ? 'positive' : 'negative'}`;
            change.textContent = `${changeValue >= 0 ? '+' : ''}${changeValue.toFixed(2)}%`;
            
            card.appendChild(pair);
            card.appendChild(price);
            card.appendChild(change);
            this.marketTickerContainer.appendChild(card);
        });
    }

    private handleMarketDataError(error: Error): void {
        this.marketTickerContainer.innerHTML = `<p class="ticker-error">Market data unavailable</p>`;
    }

    // --- Chat History Methods ---
    private loadHistory(): any[] {
        const storedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
        return storedHistory ? JSON.parse(storedHistory) : [];
    }

    private saveHistory(): void {
        const historyToSave = this.chat.history.filter(item => {
            const part = item.parts[0];
            return part && 'text' in part && !part.text.startsWith('**Error:**');
        });
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(historyToSave));
    }
    
    private clearHistory(): void {
        this.chat.history = [];
        this.saveHistory();
        this.chatContainer.innerHTML = '';
    }

    private renderHistory(): void {
        this.chatContainer.innerHTML = '';
        this.chat.history.forEach(message => {
            if (message.parts[0] && 'text' in message.parts[0]) {
               this.addMessageToUI(message.role, message.parts[0].text);
            }
        });
        this.scrollToBottom();
    }
    
    // --- UI Update Methods ---
    private addMessageToUI(role: 'user' | 'model' | string, text: string, isStreaming = false): HTMLElement {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', role === 'user' ? 'user' : 'ai');
        
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content';

        if (role !== 'user') {
            contentWrapper.innerHTML = marked.parse(text) as string;
        } else {
            const p = document.createElement('p');
            p.textContent = text;
            contentWrapper.appendChild(p);
        }

        if (isStreaming) {
            messageElement.classList.add('streaming');
        }
        
        messageElement.appendChild(contentWrapper);
        this.chatContainer.appendChild(messageElement);
        this.addCopyButtons();
        this.highlightCode();
        this.scrollToBottom();
        return messageElement;
    }
    
    private showTypingIndicator(): void {
       const indicator = document.createElement('div');
       indicator.id = 'typing-indicator';
       indicator.classList.add('message', 'ai', 'typing-indicator');
       indicator.innerHTML = `<span></span><span></span><span></span>`;
       this.chatContainer.appendChild(indicator);
       this.scrollToBottom();
    }

    private removeTypingIndicator(): void {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    private scrollToBottom(): void {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // --- Code Highlighting & Copying ---
    private highlightCode(): void {
        // @ts-ignore - hljs is loaded from a script tag
        if (window.hljs) {
            // @ts-ignore
            document.querySelectorAll('pre code:not(.hljs)').forEach((block) => {
                 // @ts-ignore
                window.hljs.highlightElement(block);
            });
        }
    }

    private addCopyButtons(): void {
        const codeBlocks = this.chatContainer.querySelectorAll('pre');
        codeBlocks.forEach(block => {
            if (block.querySelector('.copy-code-button')) {
                return; // Button already exists
            }
            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.textContent = 'Copy';
            block.appendChild(button);

            button.addEventListener('click', () => {
                const code = block.querySelector('code')?.innerText || '';
                navigator.clipboard.writeText(code).then(() => {
                    button.textContent = 'Copied!';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    button.textContent = 'Error';
                });
            });
        });
    }

    // --- Event Handlers ---
    private async handlePromptSubmit(event: Event | null, predefinedPrompt?: string): Promise<void> {
        if (event) event.preventDefault();
        
        const promptText = predefinedPrompt || this.promptInput.value.trim();
        if (!promptText) return;

        this.addMessageToUI('user', promptText);
        this.promptInput.value = '';
        this.promptInput.style.height = 'auto';
        this.promptInput.disabled = true;
        this.submitButton.disabled = true;

        this.showTypingIndicator();

        try {
            const result = await this.chat.sendMessageStream({ message: promptText });
            this.removeTypingIndicator();
            
            const aiMessageElement = this.addMessageToUI('model', '', true);
            const contentWrapper = aiMessageElement.querySelector('.message-content');

            if (contentWrapper) {
                let aiResponse = '';
                for await (const chunk of result) {
                    aiResponse += chunk.text;
                    contentWrapper.innerHTML = marked.parse(aiResponse) as string;
                    this.addCopyButtons();
                    this.highlightCode();
                    this.scrollToBottom();
                }
            }

            aiMessageElement.classList.remove('streaming');
            this.saveHistory();

        } catch (error) {
            this.removeTypingIndicator();
            
            const originalErrorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            const detailedErrorMessage = `**MQL5 Code Generation Failed**

This can happen if the request is too complex or ambiguous. Please try the following:

*   **Be more specific:** Clearly define the entry/exit conditions, indicators, and risk management.
*   **Break it down:** Request smaller pieces of code at a time (e.g., "first, write the function to calculate the moving average").
*   **Rephrase your request:** Try asking in a different way.

_Internal error: ${originalErrorMessage}_`;

            const errorElement = this.addMessageToUI('model', detailedErrorMessage);
            errorElement.classList.remove('ai');
            errorElement.classList.add('error');
            console.error(error);
        } finally {
            this.promptInput.disabled = false;
            this.submitButton.disabled = false;
            this.promptInput.focus();
        }
    }
    
    private handleHeaderAction(event: Event): void {
        const button = (event.currentTarget as HTMLButtonElement);
        let prompt = '';
        switch (button.id) {
            case 'analysis-button':
                prompt = 'Provide a brief market analysis for BTC/USDT. Include key support and resistance levels.';
                break;
            case 'calendar-button':
                prompt = 'Fetch and summarize the major global economic events for the next 7 days from reliable sources, focusing on events that could impact major currency pairs and indices. Present this information in a clear, categorized list.';
                break;
            case 'news-button':
                prompt = 'Summarize the latest major global news affecting the cryptocurrency and forex markets.';
                break;
        }
        if (prompt) {
           this.handlePromptSubmit(null, prompt);
        }
    }

    private printChat(): void {
        window.print();
    }
    
    // --- Strategy Builder Methods ---
    private handleStrategySubmit(event: Event) {
        event.preventDefault();
        const prompt = this.generateStrategyPrompt();
        if (prompt) {
            this.handlePromptSubmit(null, prompt);
            this.strategyBuilderModal.close();
        }
    }

    private addIndicatorRow() {
        const content = this.indicatorRowTemplate.content.cloneNode(true) as DocumentFragment;
        const newRow = content.querySelector('.indicator-row') as HTMLElement;
        const indicatorSelect = newRow.querySelector('.indicator-select') as HTMLSelectElement;
        const paramsContainer = newRow.querySelector('.indicator-params') as HTMLElement;

        const updateParams = () => {
            paramsContainer.innerHTML = '';
            const selected = indicatorSelect.value;
            switch(selected) {
                case 'RSI':
                    paramsContainer.innerHTML = `<div class="param-group"><label>Period</label><input type="number" value="14" class="param-rsi-period"></div>`;
                    break;
                case 'SMA':
                case 'EMA':
                    paramsContainer.innerHTML = `<div class="param-group"><label>Period</label><input type="number" value="50" class="param-ma-period"></div>`;
                    break;
                case 'MACD':
                    paramsContainer.innerHTML = `
                        <div class="param-group"><label>Fast</label><input type="number" value="12" class="param-macd-fast"></div>
                        <div class="param-group"><label>Slow</label><input type="number" value="26" class="param-macd-slow"></div>
                        <div class="param-group"><label>Signal</label><input type="number" value="9" class="param-macd-signal"></div>`;
                    break;
                case 'BollingerBands':
                     paramsContainer.innerHTML = `
                        <div class="param-group"><label>Period</label><input type="number" value="20" class="param-bb-period"></div>
                        <div class="param-group"><label>Dev</label><input type="number" value="2" step="0.1" class="param-bb-dev"></div>`;
                    break;
                case 'Stochastic':
                     paramsContainer.innerHTML = `
                        <div class="param-group"><label>%K</label><input type="number" value="5" class="param-stoch-k"></div>
                        <div class="param-group"><label>%D</label><input type="number" value="3" class="param-stoch-d"></div>
                        <div class="param-group"><label>Slowing</label><input type="number" value="3" class="param-stoch-slowing"></div>`;
                    break;
            }
             this.updateConditionIndicatorOptions();
        };

        indicatorSelect.addEventListener('change', updateParams);
        newRow.querySelector('.button-remove')?.addEventListener('click', () => {
            newRow.remove();
            this.updateConditionIndicatorOptions();
        });
        
        this.indicatorsContainer.appendChild(newRow);
        updateParams();
    }

    private addConditionRow(container: HTMLElement) {
        const content = this.conditionRowTemplate.content.cloneNode(true) as DocumentFragment;
        const newRow = content.querySelector('.condition-row') as HTMLElement;
        const valueTypeSelect = newRow.querySelector('.condition-value-type-select') as HTMLSelectElement;
        const valueInput = newRow.querySelector('.condition-value-input') as HTMLInputElement;
        const valueIndicatorSelect = newRow.querySelector('.condition-value-indicator-select') as HTMLSelectElement;

        valueTypeSelect.addEventListener('change', () => {
            const isValue = valueTypeSelect.value === 'Value';
            valueInput.classList.toggle('hidden', !isValue);
            valueIndicatorSelect.classList.toggle('hidden', isValue);
        });

        newRow.querySelector('.button-remove')?.addEventListener('click', () => newRow.remove());
        container.appendChild(newRow);
        this.updateConditionIndicatorOptions();
    }

    private updateConditionIndicatorOptions() {
        const indicatorOptions: {value: string, text: string}[] = [];
        
        this.indicatorsContainer.querySelectorAll('.indicator-row').forEach((row, index) => {
            const select = row.querySelector('.indicator-select') as HTMLSelectElement;
            const indicatorType = select.value;
            const id = `${indicatorType}_${index + 1}`;
            const name = `${indicatorType} #${index + 1}`;

            switch(indicatorType) {
                case 'MACD':
                    indicatorOptions.push({value: `${id}_Main`, text: `${name} (Main)`});
                    indicatorOptions.push({value: `${id}_Signal`, text: `${name} (Signal)`});
                    break;
                case 'BollingerBands':
                    indicatorOptions.push({value: `${id}_Upper`, text: `${name} (Upper)`});
                    indicatorOptions.push({value: `${id}_Middle`, text: `${name} (Middle)`});
                    indicatorOptions.push({value: `${id}_Lower`, text: `${name} (Lower)`});
                    break;
                case 'Stochastic':
                    indicatorOptions.push({value: `${id}_Main`, text: `${name} (Main)`});
                    indicatorOptions.push({value: `${id}_Signal`, text: `${name} (Signal)`});
                    break;
                default: // For simple indicators like RSI, SMA, EMA
                    indicatorOptions.push({value: id, text: name});
                    break;
            }
        });

        this.strategyBuilderForm.querySelectorAll('.condition-indicator-select, .condition-value-indicator-select').forEach(s => {
            const select = s as HTMLSelectElement;
            const isSubjectSelect = select.classList.contains('condition-indicator-select');
            const currentValue = select.value;
            
            let optionsHtml = isSubjectSelect ? '<option value="Price_Close">Price (Close)</option><option value="Price_Open">Price (Open)</option>' : '';
            
            indicatorOptions.forEach(opt => {
                optionsHtml += `<option value="${opt.value}">${opt.text}</option>`;
            });

            select.innerHTML = optionsHtml;
            // Attempt to restore previous value
            if (Array.from(select.options).some(opt => opt.value === currentValue)) {
                 select.value = currentValue;
            }
        });
    }
    
    private generateStrategyPrompt(): string {
        const form = this.strategyBuilderForm;
        const getVal = (id: string) => (form.querySelector(`#${id}`) as HTMLInputElement).value;

        let prompt = `Generate a complete MQL5 Expert Advisor with the following specifications. It is critical that the generated code is fully compatible with MetaTrader 5's Strategy Tester for backtesting.\n\n`;
        prompt += `**Expert Advisor Name:** ${getVal('strategy-name')}\n`;
        prompt += `**Symbol:** ${getVal('strategy-symbol')}\n`;
        prompt += `**Timeframe:** ${getVal('strategy-timeframe')}\n\n`;
        
        // Indicators
        prompt += `**Indicators:**\n`;
        const indicatorRows = form.querySelectorAll('#indicators-container .indicator-row');
        if (indicatorRows.length === 0) {
            prompt += "- None\n";
        } else {
            indicatorRows.forEach((row, index) => {
                const type = (row.querySelector('.indicator-select') as HTMLSelectElement).value;
                let params = ``;
                switch(type) {
                    case 'RSI': params = `Period=${(row.querySelector('.param-rsi-period') as HTMLInputElement).value}`; break;
                    case 'SMA': case 'EMA': params = `Period=${(row.querySelector('.param-ma-period') as HTMLInputElement).value}`; break;
                    case 'MACD': params = `Fast=${(row.querySelector('.param-macd-fast') as HTMLInputElement).value}, Slow=${(row.querySelector('.param-macd-slow') as HTMLInputElement).value}, Signal=${(row.querySelector('.param-macd-signal') as HTMLInputElement).value}`; break;
                    case 'BollingerBands': params = `Period=${(row.querySelector('.param-bb-period') as HTMLInputElement).value}, Deviation=${(row.querySelector('.param-bb-dev') as HTMLInputElement).value}`; break;
                    case 'Stochastic': params = `%K=${(row.querySelector('.param-stoch-k') as HTMLInputElement).value}, %D=${(row.querySelector('.param-stoch-d') as HTMLInputElement).value}, Slowing=${(row.querySelector('.param-stoch-slowing') as HTMLInputElement).value}`; break;
                }
                prompt += `- ${type} #${index + 1}: ${params}\n`;
            });
        }
        prompt += "\n";
        
        // Conditions
        const getConditions = (containerId: string): string => {
            let conditions = '';
            form.querySelectorAll(`#${containerId} .condition-row`).forEach((row, index) => {
                const subjectSelect = row.querySelector('.condition-indicator-select') as HTMLSelectElement;
                const subject = subjectSelect.options[subjectSelect.selectedIndex].text;
                const operator = (row.querySelector('.condition-operator-select') as HTMLSelectElement).value;
                const valueType = (row.querySelector('.condition-value-type-select') as HTMLSelectElement).value;
                let value;
                if (valueType === 'Value') {
                    value = (row.querySelector('.condition-value-input') as HTMLInputElement).value;
                } else {
                     const valueSelect = (row.querySelector('.condition-value-indicator-select') as HTMLSelectElement);
                     value = valueSelect.options[valueSelect.selectedIndex].text;
                }
                
                if (index > 0) {
                    const logicalOp = (row.querySelector('.logical-operator-select') as HTMLSelectElement).value;
                    conditions += `    - ${logicalOp} `;
                } else {
                     conditions += "    - ";
                }
                conditions += `${subject} ${operator} ${value}\n`;
            });
            return conditions || "    - None\n";
        };

        prompt += `**Entry Conditions (for a BUY trade):**\n${getConditions('entry-conditions-container')}\n`;
        prompt += `**Exit Conditions (to close a BUY trade):**\n${getConditions('exit-conditions-container')}\n`;

        // Risk Management
        prompt += `**Risk Management:**\n`;
        prompt += `- Stop Loss: ${getVal('stop-loss')} pips\n`;
        prompt += `- Take Profit: ${getVal('take-profit')} pips\n`;
        prompt += `- Lot Size: ${getVal('lot-size')}\n\n`;
        
        prompt += "Please ensure the code is well-commented, includes input parameters for all major settings, and is ready for backtesting. Also, include a detailed guide on how to perform backtesting with this EA in MetaTrader 5's Strategy Tester.";

        return prompt;
    }

}

document.addEventListener('DOMContentLoaded', () => {
    new TradingAssistantApp();
});