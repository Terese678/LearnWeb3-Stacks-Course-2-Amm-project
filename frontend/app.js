// ============================================
// IMPORT LIBRARIES
// ============================================

// This will lets us open a popup to send transactions to the blockchain
import { openContractCall } from 'https://esm.sh/@stacks/connect@8.1.9';

// These are data formatters, they convert our numbers/text into a blockchain language
import { 
    uintCV,                  // it converts regular numbers to blockchain numbers (unsigned integers)
    PostConditionMode,       // security settings for transactions
    contractPrincipalCV,     // converts contract addresses to blockchain format
    boolCV                   // converts true/false to blockchain format
} from 'https://esm.sh/@stacks/transactions@6.16.1';

// This connects us to the Stacks test network 
import { StacksTestnet } from 'https://esm.sh/@stacks/network@6.16.0';

// ============================================
// CONFIGURATION SETTINGS
// ============================================
// These are like the "settings file" all important values are stored in one place
const CONFIG = {
    contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // smart contract's home address on blockchain
    contractName: 'amm',                    // the name of AMM contract
    poolFee: 500,                          // 5% trading fee (500 out of 10,000 = 5%)
    mockTokenOne: 'mock-token',            // first test token name
    mockTokenTwo: 'mock-token-2',          // second test token name
    network: new StacksTestnet()           // use test network (free play money)
};

// ============================================
// STATE MANAGEMENT
// ============================================
// "State" is the app's memory,it remembers important information
let state = {
    userAddress: null,              // it stores the connected wallet address (like a username)
    selectedSlippage: 0.5,          // this is how much price change user accepts (default 0.5%)
    swapAmount: 0,                  // how many tokens user wants to swap
    expectedOutput: 0,              // how many tokens user expects to receive
    minimumOutput: 0,               // the minimum tokens user will accept (slippage protection!)
    poolReserves: {                 // how many tokens are in the pool
        balance0: 0,                // amount of first token
        balance1: 0                 // the amount of second token
    }
};

// ============================================
// DOM ELEMENTS
// ============================================
// DOM = Document Object Model (the HTML page structure)
// This grabs all the buttons, inputs, and text areas from the HTML so we can control them
const elements = {
    connectWalletBtn: document.getElementById('connectWalletBtn'),     // the "Connect Wallet" button
    walletAddress: document.getElementById('walletAddress'),           // shows the wallet address text
    notConnected: document.getElementById('notConnected'),             // "Please connect" message
    swapForm: document.getElementById('swapForm'),                     // the entire swap form container
    swapFormElement: document.getElementById('swapFormElement'),       // the actual form element
    swapAmount: document.getElementById('swapAmount'),                 // the number input box
    swapBtn: document.getElementById('swapBtn'),                       // the "Execute Swap" button
    slippageButtons: document.querySelectorAll('.slippage-btn'),       // all slippage buttons (0.5%, 1%, 5%)
    swapPreview: document.getElementById('swapPreview'),               // the preview box showing calculations
    expectedOutput: document.getElementById('expectedOutput'),         // shows expected tokens
    minimumOutput: document.getElementById('minimumOutput'),           // shows minimum tokens (protection!)
    slippageProtection: document.getElementById('slippageProtection'), // shows current slippage %
    alertContainer: document.getElementById('alertContainer'),         // where success/error messages appear
    loadingState: document.getElementById('loadingState')              // "Processing transaction..." spinner
};

// ============================================
// INITIALIZE APP
// ============================================
// the "power on" button that starts everything
function init() {
    setupEventListeners();      // connect buttons to their actions
    checkWalletConnection();    // see if wallet is already connected
}

// ============================================
// EVENT LISTENERS
// ============================================
// Event listeners are like "when this happens, do that"
// Example: "when the user clicks button, run this function"
function setupEventListeners() {
    // when "Connect Wallet" button is clicked, run handleConnectWallet function
    elements.connectWalletBtn.addEventListener('click', handleConnectWallet);
    
    // when any slippage button is clicked (0.5%, 1%, 5%), run handleSlippageChange
    elements.slippageButtons.forEach(btn => {
        btn.addEventListener('click', handleSlippageChange);
    });

    // when user types in the amount box, run handleAmountChange
    elements.swapAmount.addEventListener('input', handleAmountChange);
    
    // when the user submits the form (clicks swap), run handleSwapSubmit
    elements.swapFormElement.addEventListener('submit', handleSwapSubmit);
}

// ============================================
// CHECK WALLET CONNECTION
// ============================================
// check if a wallet was already connected before (currently just logs a message)
function checkWalletConnection() {
    // in a real app, this would check browser storage for saved connection
    // for now, user must manually connect each time
    console.log('Checking wallet connection...');
}

// ============================================
// WALLET CONNECTION - USED THE DIRECT LEATHER METHOD
// ============================================
// this connects to the user's Leather wallet (like logging into your bank account)
async function handleConnectWallet() {
    try {
        // show yellow warning message saying "connecting..."
        showAlert('Connecting to wallet...', 'warning');
        
        // check if Leather wallet extension is installed in browser
        if (!window.LeatherProvider) {
            showAlert('Leather wallet not detected. Please install it from leather.io', 'error');
            return; // Stop here if no wallet found
        }
        
        console.log('Requesting address from Leather...');
        
        // ask Leather wallet for user's addresses
        const response = await window.LeatherProvider.request('getAddresses');
        
        console.log('Leather response:', response);
        
        // if we got addresses back from the wallet
        if (response && response.result && response.result.addresses) {
            // find the Stacks (STX) testnet address from all the addresses
            const stxAddress = response.result.addresses.find(addr => addr.type === 'p2wpkh' || addr.type === 'stx');
            
            if (stxAddress) {
                // success! we have the address, now connect the wallet
                handleWalletConnected(stxAddress.address);
            } else {
                // address not found - maybe wallet is locked or on wrong network
                showAlert('Could not get address. Make sure Leather is unlocked and on Testnet4.', 'error');
                console.log('All addresses:', response.result.addresses);
            }
        } else {
            // couldn't get any addresses, wallet might be locked
            showAlert('Failed to connect. Please unlock your Leather wallet.', 'error');
        }
        
    } catch (error) {
        // something went wrong during connection
        console.error('Wallet connection error:', error);
        
        // check if the user clicked "cancel" in the wallet popup
        if (error.code === 4001 || error.message?.includes('rejected')) {
            showAlert('Connection cancelled by user', 'warning');
        } else {
            // some other error happened
            showAlert('Failed to connect: ' + (error.message || 'Unknown error'), 'error');
        }
    }
}

// ============================================
// HANDLE SUCCESSFUL WALLET CONNECTION
// ============================================
// Once wallet is connected, update the UI to show it
function handleWalletConnected(address) {
    // save the wallet address in our app's memory
    state.userAddress = address;
    
    // UPDATE THE USER INTERFACE
    // show shortened address (first 8 and last 6 characters) like: ST1PQHQK...TPGZGM
    elements.walletAddress.textContent = `${address.slice(0, 8)}...${address.slice(-6)}`;
    elements.walletAddress.classList.remove('hidden');  // make address visible
    elements.notConnected.classList.add('hidden');      // hide "please connect" message
    
    // change button appearance to show it's connected
    elements.connectWalletBtn.textContent = 'Connected';
    elements.connectWalletBtn.classList.add('btn-secondary');    // gray style
    elements.connectWalletBtn.classList.remove('btn-primary');   // remove blue style
    
    // show the swap form (it was hidden before wallet connected)
    elements.swapForm.classList.remove('hidden');
    
    // show green success message
    showAlert('Wallet connected successfully!', 'success');
    
    // load pool information from blockchain
    fetchPoolData();
}

// ============================================
// HANDLE SLIPPAGE TOLERANCE CHANGE
// ============================================
// when user clicks a slippage button (0.5%, 1%, or 5%)
function handleSlippageChange(event) {
    // get the slippage value from the button (stored in data-slippage attribute)
    const slippage = parseFloat(event.currentTarget.dataset.slippage);
    state.selectedSlippage = slippage;  // save it to our app's memory
    
    // update button styles - remove 'active' from all, add to clicked one
    elements.slippageButtons.forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    // update the displayed slippage percentage
    elements.slippageProtection.textContent = `${slippage}%`;
    
    // if user already entered an amount, recalculate with new slippage
    if (state.swapAmount > 0) {
        calculateSwapOutput();
    }
}

// ============================================
// HANDLE AMOUNT INPUT CHANGE
// ============================================
// when user types a number in the "Amount to Swap" box
function handleAmountChange(event) {
    // get the number they typed (or 0 if invalid)
    const amount = parseInt(event.target.value) || 0;
    state.swapAmount = amount;  // save it to memory
    
    // enable/disable the swap button based on amount
    elements.swapBtn.disabled = amount <= 0;  // disabled if 0 or negative
    elements.swapBtn.textContent = amount > 0 ? 'Calculate & Preview Swap' : 'Enter Amount to Continue';
    
    // if amount is valid, calculate how many tokens they'll get
    if (amount > 0) {
        calculateSwapOutput();
    } else {
        // hide the preview if no valid amount
        elements.swapPreview.classList.add('hidden');
    }
}

// ============================================
// CALCULATE SWAP OUTPUT
// ============================================
// this is the MATH FUNCTION - calculates expected tokens and minimum (slippage protection)
function calculateSwapOutput() {
    const amountIn = state.swapAmount;  // how many tokens user is putting in
    
    // POOL RESERVES (how many tokens are in the liquidity pool)
    // in production, fetch these from blockchain contract
    // for now using example values: 1 million token-0 and 500k token-1
    const reserveIn = 1000000;   // pool's balance of token we're giving
    const reserveOut = 500000;   // pool's balance of token we're receiving
    const fee = CONFIG.poolFee;  // trading fee: 500 = 5%
    
    // AMM FORMULA (Automated Market Maker math)
    // this is the constant product formula: x * y = k
    // formula: amountOut = (amountIn * (10000 - fee) * reserveOut) / ((reserveIn * 10000) + (amountIn * (10000 - fee)))
    
    const amountInWithFee = amountIn * (10000 - fee);  //subtract fee from input
    const numerator = amountInWithFee * reserveOut;    // top of fraction
    const denominator = (reserveIn * 10000) + amountInWithFee;  // bottom of fraction
    const expectedOutput = Math.floor(numerator / denominator);  // calculate output
    
    // SLIPPAGE PROTECTION CALCULATION
    // if slippage is 0.5%, we accept 99.5% of expected output as minimum
    const slippageMultiplier = 1 - (state.selectedSlippage / 100);  // 1 - 0.005 = 0.995
    const minimumOutput = Math.floor(expectedOutput * slippageMultiplier);  // 99.5% of expected
    
    // SAVE CALCULATIONS TO MEMORY
    state.expectedOutput = expectedOutput;
    state.minimumOutput = minimumOutput;
    
    // UPDATE THE UI TO SHOW CALCULATIONS
    elements.expectedOutput.textContent = `~${expectedOutput.toLocaleString()} tokens`;  // ~495 tokens
    elements.minimumOutput.textContent = `${minimumOutput.toLocaleString()} tokens`;     // 492 tokens (with 0.5% slippage)
    elements.swapPreview.classList.remove('hidden');  // show the preview box
    
    // change button text to show we're ready to execute
    elements.swapBtn.textContent = 'Execute Swap';
}

// ============================================
// HANDLE SWAP FORM SUBMISSION
// ============================================
// when user clicks "Execute Swap" button, this sends transaction to blockchain
async function handleSwapSubmit(event) {
    event.preventDefault();  // stop form from refreshing the page, default behavior
    
    // SAFETY CHECKS
    if (!state.userAddress) {
        showAlert('Please connect your wallet first', 'error');
        return;  // stop if no wallet connected
    }
    
    if (state.swapAmount <= 0) {
        showAlert('Please enter a valid amount', 'error');
        return;  // stop if invalid amount
    }
    
    // SHOW LOADING SPINNER
    elements.swapFormElement.classList.add('hidden');     // hide the form
    elements.loadingState.classList.remove('hidden');     // show "Processing..." spinner
    
    try {
        // PREPARE CONTRACT ADDRESSES
        // convert token contract names to blockchain format
        const token0Principal = contractPrincipalCV(CONFIG.contractAddress, CONFIG.mockTokenOne);
        const token1Principal = contractPrincipalCV(CONFIG.contractAddress, CONFIG.mockTokenTwo);
        
        // PREPARE FUNCTION ARGUMENTS
        // these are the 6 parameters the swap() function needs
        const functionArgs = [
            token0Principal,                    // 1. token-0 (first token contract)
            token1Principal,                    // 2. token-1 (second token contract)
            uintCV(CONFIG.poolFee),            // 3. fee (500 = 5%)
            uintCV(state.swapAmount),          // 4. amount-in (how many tokens to swap)
            boolCV(true),                      // 5. a-to-b (true = swap token-0 for token-1)
            uintCV(state.minimumOutput)        // 6. min-amount-out (YOUR SLIPPAGE PROTECTION!)
        ];
        
        // EXECUTE THE BLOCKCHAIN TRANSACTION
        // this opens Leather wallet popup asking user to approve
        await openContractCall({
            contractAddress: CONFIG.contractAddress,    // where the contract lives
            contractName: CONFIG.contractName,         // contract name 'amm'
            functionName: 'swap',                      // cunction to call
            functionArgs: functionArgs,                // the 6 arguments above
            postConditionMode: PostConditionMode.Allow, // allow transaction (use Deny in production for safety)
            network: CONFIG.network,                   // testnet
            onFinish: (data) => {
                handleSwapSuccess(data);  // run this when transaction succeeds
            },
            onCancel: () => {
                handleSwapCancel();  // run this if user cancels in wallet
            }
        });
        
    } catch (error) {
        // if anything goes wrong, show error
        console.error('Swap error:', error);
        handleSwapError(error);
    }
}

// ============================================
// HANDLE SUCCESSFUL SWAP
// ============================================
// when the blockchain confirms the swap transaction succeeded
function handleSwapSuccess(data) {
    // hide loading spinner, show form again
    elements.loadingState.classList.add('hidden');
    elements.swapFormElement.classList.remove('hidden');
    
    // show success message with transaction ID (shortened)
    showAlert(
        `✅ Swap successful! Transaction ID: ${data.txId.slice(0, 10)}...`,
        'success'
    );
    
    // RESET THE FORM for next swap
    elements.swapAmount.value = '';  // clear the input box
    state.swapAmount = 0;            // clear from memory
    elements.swapPreview.classList.add('hidden');  // hide preview
    elements.swapBtn.disabled = true;              // disable button
    elements.swapBtn.textContent = 'Enter Amount to Continue';  // reset button text
    
    console.log('Transaction details:', data);
}

// ============================================
// HANDLE SWAP CANCELLATION
// ============================================
// when user clicks "Cancel" in the Leather wallet popup
function handleSwapCancel() {
    // hide loading spinner,show form again
    elements.loadingState.classList.add('hidden');
    elements.swapFormElement.classList.remove('hidden');
    
    // show warning message
    showAlert('Transaction cancelled', 'warning');
}

// ============================================
// HANDLE SWAP ERROR
// ============================================
// when the swap transaction fails
function handleSwapError(error) {
    // hide loading spinner, show form again
    elements.loadingState.classList.add('hidden');
    elements.swapFormElement.classList.remove('hidden');
    
    // check if it's YOUR SLIPPAGE PROTECTION ERROR (ERR 209)
    const errorMessage = error.toString();
    if (errorMessage.includes('209') || errorMessage.includes('slippage')) {
        // SLIPPAGE PROTECTION WORKED, the Price moved too much
        showAlert(
            '🛡️ Slippage Protection Triggered! The actual output would be less than your minimum. Try increasing slippage tolerance or waiting for better market conditions.',
            'error'
        );
    } else {
        // some other error, maybe insufficient balance, etc.
        showAlert(`Transaction failed: ${error.message || 'Unknown error'}`, 'error');
    }
    
    console.error('Swap error details:', error);
}

// ============================================
// FETCH POOL DATA
// ============================================
// get the pool's token balances from blockchain (currently using mock data)
async function fetchPoolData() {
    // in production, this would call your contract's get-pool-data function
    // for now, using the same test values from your Clarity tests
    state.poolReserves = {
        balance0: 1000000,  // 1 million of token-0
        balance1: 500000    // 500 thousand of token-1
    };
    
    console.log('Pool reserves loaded:', state.poolReserves);
}

// ============================================
// SHOW ALERT MESSAGE
// ============================================
// display colored message boxes (green success,red error, yellow warning)
function showAlert(message, type = 'success') {
    // create a new div element for the alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;  // add CSS classes for styling
    alertDiv.textContent = message;              // put the message text inside
    
    // clear any old alerts and add the new one
    elements.alertContainer.innerHTML = '';
    elements.alertContainer.appendChild(alertDiv);
    
    // auto-remove the alert after 5 seconds (5000 milliseconds)
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// ============================================
// APP INITIALIZATION
// ============================================
// start the app when the HTML page fully loads
// DOM = Document Object Model,the HTML structure
if (document.readyState === 'loading') {
    // If HTML is still loading, wait for it to finish
    document.addEventListener('DOMContentLoaded', init);
} else {
    // HTML already loaded, start immediately
    init();
}