;; title: amm

;; version: 3.0

;; summary: this contract lets people create their own trading spots for different tokens
;; anyone can start a new trading pair, put in some tokens to get it going
;; and then others can come trade or add their own tokens too. When people trade
;; they pay a tiny fee that goes back to whoever helped make the trading possible

;; description: it is basically a way for people to trade tokens directly with each other 
;; while making it worth everyone's time to participate

;; traits
(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;;----------------------------------
;; CONSTANTS
;;----------------------------------
(define-constant MINIMUM_LIQUIDITY u1000) ;; minimum liquidity that must exist in a pool
(define-constant THIS_CONTRACT (as-contract tx-sender)) ;; The AMM contract needs its own "bank account" to hold tokens 
;; so with as-contract there is a switch in identity so as-contract makes the contract itself become the tx-sender 
(define-constant FEES_DENOM u10000) ;; fees denominator

;;----------------------------------
;; ERROR MESSAGES
;;----------------------------------
(define-constant ERR_POOL_ALREADY_EXISTS (err u200)) ;; this pool already exists
(define-constant ERR_INCORRECT_TOKEN_ORDERING (err u201)) ;; incorrect token ordering (invalid sorting)
(define-constant ERR_INSUFFICIENT_LIQUIDITY_MINTED (err u202)) ;; insufficient liquidity amounts being added
(define-constant ERR_INSUFFICIENT_LIQUIDITY_OWNED (err u203)) ;; not enough liquidity owned to withdraw the requested amount
(define-constant ERR_INSUFFICIENT_LIQUIDITY_BURNED (err u204)) ;; insufficient liquidity amounts being removed
(define-constant ERR_INSUFFICIENT_INPUT_AMOUNT (err u205)) ;; insufficient input token amount for swap
(define-constant ERR_INSUFFICIENT_LIQUIDITY_FOR_SWAP (err u206)) ;; insufficient liquidity in pool for swap
(define-constant ERR_INSUFFICIENT_1_AMOUNT (err u207)) ;; insufficient amount of token 1 for swap
(define-constant ERR_INSUFFICIENT_0_AMOUNT (err u208)) ;; insufficient amount of token 0 for swap
(define-constant ERR_INSUFFICIENT_OUTPUT_AMOUNT (err u209)) ;; insuficient output amount, 
;; when someone tries to give less tokens than you expect, this error comes up for slippage protection

;;----------------------------------
;; MAPINGS
;;----------------------------------
;; this map stores information about each trading pool,
;; and be identified by some sort of unique Pool ID 
;; since we want anyone to be able to set up new trading pools
;; POOLS
(define-map pools (buff 20) ;; Pool ID (hash of Token0 + Token1 + Fee)
    {
        token-0: principal,
        token-1: principal,
        fee: uint,
        liquidity: uint,
        balance-0: uint,
        balance-1: uint
    }
)

;; this map keep track of liquidity positions, 
;; since we want anyone to be able to become a liquidity provider and supply liquidity to the pool
;; POSITIONS
(define-map positions 
    { 
        pool-id: (buff 20),
        owner: principal
    } 
    { 
        liquidity: uint ;; this is how many liquidity tokens this person owns in this pool
    }
)

;; mainly we've defined the pools and positions maps. 
;; We've also used use-trait to refer to the SIP-010 trait by the name of ft-trait i.e. 
;; fungible Token Trait
;; Finally we've defined some constants to use as error messages and other helpful values 
;; which will become clear as we start writing code and hit those error cases

;;============================
;; PRIVATE HELPER FUNCTIONS
;;============================

;; GET-POOL-ID
;; compute the hash of (token0 + token1 + fee) to use as a pool ID
(define-read-only (get-pool-id (pool-info {token-0: <ft-trait>, token-1: <ft-trait>, fee: uint})) 
    (let
        (
            ;; convert the pool information into a byte format that can be hashed
            (buff (unwrap-panic (to-consensus-buff? pool-info)))

            ;; create a unique 20-byte identifier by hashing the pool information
            (pool-id (hash160 buff))
        )

        ;; return the computed pool identifier
        pool-id
    )
)

;; CORRECT-TOKEN-ORDERING
;; ensure that the token-0 principal is "less than" the token-1 principal
(define-private (correct-token-ordering (token-0 principal) (token-1 principal)) 
    (let
        (
            ;; convert first token address to bytes for comparison
            (token-0-buff (unwrap-panic (to-consensus-buff? token-0)))

            ;; convert second token address to bytes for comparison
            (token-1-buff (unwrap-panic (to-consensus-buff? token-1)))
        )

        ;; verify that first token comes before second token alphabetically
        (asserts! (< token-0-buff token-1-buff) ERR_INCORRECT_TOKEN_ORDERING)

        ;; confirm the ordering is correct
        (ok true)
    )
)

;; GET-POSITION-LIQUIDITY
;; given a Pool ID and a user address, returns how much liquidity the user has in the pool
(define-read-only (get-position-liquidity (pool-id (buff 20)) (owner principal))
    (let
        (
            ;; look up the position in the `positions` map
            (position (map-get? positions { pool-id: pool-id, owner: owner }))

            ;; if position exists, return the liquidity otherwise return 0
            (existing-owner-liquidity (if (is-some position) (unwrap-panic position) {liquidity: u0}))
        )

        (ok (get liquidity existing-owner-liquidity))
    )
)

;; GET-AMOUNTS
;; given the desired amount of token-0 and token-1, the minimum amounts of token-0 and token-1, and current reserves of token-0 and token-1,
;; returns the amounts of token-0 and token-1 that should be provided to the pool to meet all constraints
(define-private (get-amounts 
    (amount-0-desired uint) 
    (amount-1-desired uint) 
    (amount-0-min uint) 
    (amount-1-min uint) 
    (balance-0 uint) (balance-1 uint)) 
    (let
        (
            ;; calculate ideal amount of token-1 that should be provided based on the current ratio of reserves if `amount-0-desired` can be fully used
            (amount-1-given-0 (/ (* amount-0-desired balance-1) balance-0))

            ;; calculate ideal amount of token-0 that should be provided based on the current ratio of reserves if `amount-1-desired` can be fully used
            (amount-0-given-1 (/ (* amount-1-desired balance-0) balance-1))
        )

        (if 
            ;; if ideal amount-1 is less than the desired amount-1
            (<= amount-1-given-0 amount-1-desired)
            (begin 
                ;; make sure that ideal amount-1 is >= minimum amount-1 otherwise throw an error
                (asserts! (>= amount-1-given-0 amount-1-min) ERR_INSUFFICIENT_1_AMOUNT)

                ;; we can add amount-0-desired and ideal amount-1 to the pool successfully
                (ok { amount-0: amount-0-desired, amount-1: amount-1-given-0 })
            )

            ;; else if ideal amount-1 is greater than the desired amount-1, we can only add up to `amount-1-desired` to the pool
            (begin 
                ;; make sure that ideal amount-0 is <= desired amount-0 otherwise throw an error
                (asserts! (<= amount-0-given-1 amount-0-desired) ERR_INSUFFICIENT_0_AMOUNT)

                ;; make sure that ideal amount-0 is >= minimum amount-0 otherwise throw an error
                (asserts! (>= amount-0-given-1 amount-0-min) ERR_INSUFFICIENT_0_AMOUNT)

                ;; we can add ideal amount-0 and amount-1-desired to the pool successfully
                (ok { amount-0: amount-0-given-1, amount-1: amount-1-desired })
            )
        )
    )
)

;; GET-POOL-DATA
;; given a pool ID, returns the current state of the pool from the mapping
(define-read-only (get-pool-data (pool-id (buff 20))) 
    (let 
        (
            ;; search for pool information using the provided pool ID
            (pool-data (map-get? pools pool-id))
        )

        ;; send back the pool data wrapped in a success response
        (ok pool-data)
    )
)

;; helper function to find the smaller of two numbers
;; it is quite essential for maintaining proper ratios when adding liquidity
(define-private (min (a uint) (b uint)) 
    ;; Compare the two values and return the smaller one
    (if (< a b) a b)
)

;;============================
;; PUBLIC FUNCTIONS
;;============================

;; CREATE-POOL
;; creates a new pool with the given token-0, token-1, and fee
;; ensures that a pool with these two tokens and given fee amount does not already exist
(define-public (create-pool (token-0 <ft-trait>) (token-1 <ft-trait>) (fee uint))
    (let
        (
            ;; create a pool-info tuple with the information
            (pool-info {
                token-0: token-0,
                token-1: token-1,
                fee: fee
            })

            ;; compute the pool ID
            (pool-id (get-pool-id pool-info))

            ;; ensure this Pool ID doesn't already exist in the `pools` map
            (pool-does-not-exist (is-none (map-get? pools pool-id)))

            ;; convert the <ft-trait> values into principals
            (token-0-principal (contract-of token-0))
            (token-1-principal (contract-of token-1))

            ;; prepare the pool-data tuple
            (pool-data {
                token-0: token-0-principal,
                token-1: token-1-principal,
                fee: (get fee pool-info),
                liquidity: u0, ;; initially, liquidity is 0
                balance-0: u0, ;; initially, balance-0 (x) is 0
                balance-1: u0 ;; initially, balance-1 (y) is 0
            })
        )

        ;; if pool does already exist, throw an error
        (asserts! pool-does-not-exist ERR_POOL_ALREADY_EXISTS)
        
        ;; if the token-0 principal is not "less than" the token-1 principal, throw an error
        (asserts! (is-ok (correct-token-ordering token-0-principal token-1-principal)) 
            ERR_INCORRECT_TOKEN_ORDERING
        )

        ;; Update the `pools` map with the new pool data
        (map-set pools pool-id pool-data)

        (print { action: "create-pool", data: pool-data})

        (ok true)
    )
)

;; ADD-LIQUIDITY
;; this is the main function that lets people add their tokens to a trading pool
;; when you add liquidity, you get liquidity tokens back that represent your share of the pool
(define-public (add-liquidity 
    (token-0 <ft-trait>) 
    (token-1 <ft-trait>) 
    (fee uint) 
    (amount-0-desired uint) 
    (amount-1-desired uint) 
    (amount-0-min uint) (amount-1-min uint))
    (let
        (
            ;; compute the pool id and fetch the current state of the pool from the mapping
            (pool-info {
                token-0: token-0,
                token-1: token-1,
                fee: fee
            })

            ;; create the unique ID for this pool
            (pool-id (get-pool-id pool-info))

            ;; retrieve current pool status or fail if pool doesn't exist
            (pool-data (unwrap! (map-get? pools pool-id) (err u0)))

            ;; identify who is adding liquidity to the pool
            (sender tx-sender)
            
            ;; get the current total liquidity in the pool
            (pool-liquidity (get liquidity pool-data))

            ;; extract current amount of first token in the pool
            (balance-0 (get balance-0 pool-data))

            ;; extract current amount of second token in the pool
            (balance-1 (get balance-1 pool-data))

            ;; fetch the current liquidity of the user in the pool (default 0 if no existing position)
            (user-liquidity (unwrap! (get-position-liquidity pool-id sender) (err u0)))

            ;; check if this is the very first time anyone is adding liquidity to this pool?
            (is-initial-liquidity (is-eq pool-liquidity u0))

            ;; calculate exactly how many tokens to be added to the pool
            (amounts 
                (if 
                    is-initial-liquidity
                    ;; if it is the first time, we can add tokens in whatever amounts we want
                    {amount-0: amount-0-desired, amount-1: amount-1-desired}
                    ;; otherwise, we use get-amounts to calculate the amounts of tokens to add within the constraints
                    (unwrap! (get-amounts amount-0-desired amount-1-desired amount-0-min amount-1-min balance-0 balance-1) (err u0))
                )
            )

            ;; final amount of first token that will be deposited
            (amount-0 (get amount-0 amounts))
            ;; final amount of second token that will be deposited
            (amount-1 (get amount-1 amounts))

            ;; calculate the new liquidity (L value) 
            (new-liquidity 
                (if 
                    is-initial-liquidity

                    ;; if this is first-time liquidity, we subtract MINIMUM_LIQUIDITY to make sure that the pool has at least some liquidity forever
                    ;; so we compute L = sqrt(x * y) - MINIMUM_LIQUIDITY
                    (- (sqrti (* amount-0 amount-1)) MINIMUM_LIQUIDITY)

                    ;; if it is not the first time, we update L based on how much % of the pool's liquidity this user is adding
                    ;; min( amount0 * pool-liquidity / balance0 , amount1 * pool-liquidity / balance1 )
                    (min (/ (* amount-0 pool-liquidity) balance-0) (/ (* amount-1 pool-liquidity) balance-1))
                )
            )

            ;; calculate total pool liquidity after this addition
            (new-pool-liquidity
                (if
                    is-initial-liquidity
                    (+ new-liquidity MINIMUM_LIQUIDITY)
                    new-liquidity
                )
            )
        )

        ;; verify that the user will receive meaningful liquidity tokens
        (asserts! (> new-liquidity u0) ERR_INSUFFICIENT_LIQUIDITY_MINTED)

        ;; transfer tokens from user to pool
        (try! (contract-call? token-0 transfer amount-0 sender THIS_CONTRACT none))
        (try! (contract-call? token-1 transfer amount-1 sender THIS_CONTRACT none))

        ;; update the `positions` map with the new liquidity of the user (pre existing liquidity + new liquidity)
        (map-set positions 
            {
                pool-id: pool-id,
                owner: sender
            }
            {
                liquidity: (+ user-liquidity new-liquidity)
            }
        )

        ;; update the `pools` map with the new pool liquidity, balance-0, and balance-1
        (map-set pools pool-id (merge pool-data {
            liquidity: (+ pool-liquidity new-pool-liquidity),
            balance-0: (+ balance-0 amount-0),
            balance-1: (+ balance-1 amount-1)
        }))

        ;; log the liquidity addition event for external monitoring
        (print { action: "add-liquidity", pool-id: pool-id, amount-0: amount-0, amount-1: amount-1, liquidity: (+ user-liquidity new-liquidity) })

        ;; successful liquidity addition confirmation
        (ok true)
    )
)

;; REMOVE-LIQUIDITY
;; removes liquidity from a given pool
;; ensure the pool exists, ensures the user owns enough liquidity as they want to remove, calculate amount of tokens to give back to them
;; eransfer tokens from pool to user, and update mappings as needed
(define-public (remove-liquidity (token-0 <ft-trait>) (token-1 <ft-trait>) (fee uint) (liquidity uint))
    (let
        (
            ;; compute the pool id and fetch the current state of the pool from the mapping
            (pool-info {
                token-0: token-0,
                token-1: token-1,
                fee: fee
            })

            ;; create the unique pool identifier from token pair and fee
            (pool-id (get-pool-id pool-info))

            ;; get current pool state or fail if pool doesn't exist
            (pool-data (unwrap! (map-get? pools pool-id) (err u0)))

            ;; identify who wants to remove liquidity
            (sender tx-sender)

            ;; get total liquidity currently in the pool
            (pool-liquidity (get liquidity pool-data))

            ;; get current balance of first token in pool
            (balance-0 (get balance-0 pool-data))

            ;; get current balance of second token in pool
            (balance-1 (get balance-1 pool-data))

            ;; fetch the user's position
            (user-liquidity (unwrap! (get-position-liquidity pool-id sender) (err u0)))

            ;; calculate how much amount-0 and amount-1 the user should receive as a % of how much they are withdrawing compared to the total pool liquidity
            (amount-0 (/ (* liquidity balance-0) pool-liquidity))
            (amount-1 (/ (* liquidity balance-1) pool-liquidity))

        )

        ;; make sure user owns enough liquidity to withdraw
        (asserts! (>= user-liquidity liquidity) ERR_INSUFFICIENT_LIQUIDITY_OWNED)

        ;; make sure user is getting at least some amount of tokens back
        (asserts! (> amount-0 u0) ERR_INSUFFICIENT_LIQUIDITY_BURNED)
        (asserts! (> amount-1 u0) ERR_INSUFFICIENT_LIQUIDITY_BURNED)

        ;; transfer tokens from pool to user
        (try! (as-contract (contract-call? token-0 transfer amount-0 THIS_CONTRACT sender none)))
        (try! (as-contract (contract-call? token-1 transfer amount-1 THIS_CONTRACT sender none)))

        ;; update the `positions` map with the new liquidity of the user (pre existing liquidity - new liquidity)
        (map-set positions 
            {
                pool-id: pool-id,
                owner: sender
            }
            {
                liquidity: (- user-liquidity liquidity)
            }
        )

        ;; update the `pools` map with the new pool liquidity, balance-0, and balance-1
        (map-set pools pool-id (merge pool-data {
            liquidity: (- pool-liquidity liquidity),
            balance-0: (- balance-0 amount-0),
            balance-1: (- balance-1 amount-1)
        }))

        ;; record the liquidity removal event for tracking purposes
        (print { action: "remove-liquidity", pool-id: pool-id, amount-0: amount-0, amount-1: amount-1, liquidity: liquidity })

        ;; successful liquidity removal confirmation
        (ok true)
    )
)

;; SWAP
;;------------------------------------------------------------------------------------------
;; Terese's upgraded trading function. After learning about slippage in DeFi, 
;; I realized that users needed protection from getting robbed. 
;; This function now has my "minimum guarantee" feature if you don't get what you expected, 
;; the trade fails
;;------------------------------------------------------------------------------------------
;; swaps two tokens in a given pool
;; ensure the pool exists, calculate the amount of tokens to give back to the user, handle the case where the user is swapping for token-0 or token-1
;; transfer input token from user to pool, transfer output token from pool to user, and update mappings as needed
(define-public (swap 
    (token-0 <ft-trait>) 
    (token-1 <ft-trait>) 
    (fee uint) 
    (input-amount uint) 
    (zero-for-one bool) (min-amount-out uint)) 
    (let
        (
            ;; compute the pool id and fetch the current state of the pool from the mapping
            (pool-info {
                token-0: token-0,
                token-1: token-1,
                fee: fee
            })

            ;; create unique identifier for the trading pool
            (pool-id (get-pool-id pool-info))

            ;; fetch current pool information or fail if pool doesn't exist
            (pool-data (unwrap! (map-get? pools pool-id) (err u0)))

            ;; identify who is performing the token swap
            (sender tx-sender)

            ;; get total liquidity tokens in circulation for this pool
            (pool-liquidity (get liquidity pool-data))

            ;; get current reserve of first token in the pool
            (balance-0 (get balance-0 pool-data))

            ;; get current reserve of second token in the pool
            (balance-1 (get balance-1 pool-data))

            ;; xy = k
            ;; compute the constant k before the swap
            (k (* balance-0 balance-1))

            ;; keep track of which token is the input and which is the output
            ;; based on the value of zero-for-one
            (input-token (if zero-for-one token-0 token-1))
            (output-token (if zero-for-one token-1 token-0))

            ;; keep track of the input and output balances
            (input-balance (if zero-for-one balance-0 balance-1))
            (output-balance (if zero-for-one balance-1 balance-0))

            ;; compute the output amount by solving xy = k
            (output-amount (- output-balance (/ k (+ input-balance input-amount))))

            ;; calculate fees to charge as a % of the output amount
            (fees (/ (* output-amount fee) FEES_DENOM))

            ;; subtract the fees from the output amount
            (output-amount-sub-fees (- output-amount fees))

            ;; compute the new balances of the pool after the swap
            (balance-0-post-swap (if zero-for-one (+ balance-0 input-amount) (- balance-0 output-amount-sub-fees)))
            (balance-1-post-swap (if zero-for-one (- balance-1 output-amount-sub-fees) (+ balance-1 input-amount)))
        )

        ;; make sure user is swapping >0 tokens
        (asserts! (> input-amount u0) ERR_INSUFFICIENT_INPUT_AMOUNT)

        ;; make sure user is getting back >0 tokens
        (asserts! (> output-amount-sub-fees u0) ERR_INSUFFICIENT_LIQUIDITY_FOR_SWAP)

        ;; make sure we can afford to do this swap (have enough output tokens to give back to user)
        (asserts! (< output-amount-sub-fees output-balance) ERR_INSUFFICIENT_LIQUIDITY_FOR_SWAP)

        ;; SLIPPAGE PROTECTION: make sure the user gets at least their minimum expected amount
        (asserts! (>= output-amount-sub-fees min-amount-out) ERR_INSUFFICIENT_OUTPUT_AMOUNT)

        ;; transfer input token from user to pool
        (try! (contract-call? input-token transfer input-amount sender THIS_CONTRACT none))

        ;; transfer output token from pool to user
        (try! (as-contract (contract-call? output-token transfer output-amount-sub-fees THIS_CONTRACT sender none)))

        ;; update pool balances (x and y)
        (map-set pools pool-id (merge pool-data {
            balance-0: balance-0-post-swap,
            balance-1: balance-1-post-swap
        }))

        ;; log the swap transaction for external monitoring
        (print { action: "swap", 
            pool-id: pool-id, 
            input-amount: input-amount, 
            output-amount: output-amount-sub-fees, 
            min-amount-out: min-amount-out }
        )

        ;; confirms successful token swap
        (ok true)
    )
)
