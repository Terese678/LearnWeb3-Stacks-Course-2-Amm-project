;; title: mock-token

;; version: 3.0

;; author: Timothy Terese Chimbiv 
;; created for: Stacks Ascent Program public learning portfolio

;; summary: this is a simple fungible token contract
;; it is designed to work with my AMM contract for the Ascent program

;; description: This is my learning focused token implementation

;; this line of code tells Clarity our token follows the standard rules
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;;----------------------------------
;; CONSTANTS 
;;----------------------------------

(define-constant contract-owner tx-sender)	;; who deployed the contract
(define-constant err-owner-only (err u100))	;; error code for "you're not the owner of this contract
(define-constant err-not-token-owner (err u101)) ;; error code for "these aren't your tokens to move

;;----------------------------------
;; THE ACTUAL TOKEN
;;----------------------------------

(define-fungible-token mock-token)

;;============================
;; REQUIRED FUNCTIONS (SIP-010 standard demands these)
;;============================

;; TRANSFER 
;; how tokens move from person A to person B
;; this is the function AMM will call constantly during swaps
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
	(begin
		;;only you can move your own tokens
		(asserts! (is-eq tx-sender sender) err-not-token-owner)

		;; move the tokens (this is where the magic happens)
		;; but, if someone doesn't have enough tokens, this line will fail and stop everything
		(try! (ft-transfer? mock-token amount sender recipient))

		;; if there's a memo, print it; if not, do nothing (0x means empty)
		(match memo to-print (print to-print) 0x)

		;; return true to confirm everything worked
		(ok true)
	)
)

;; GET-NAME:tells everyone what to call this token
;; when someone opens their wallet and sees this token, this is the full name that shows up
(define-read-only (get-name)
	(ok "Mock Token")
)

;; GET-SYMBOL: the short nickname for this token  
;; MT stands for Mock Token 
(define-read-only (get-symbol)
	(ok "MT")
)

;; GET-DECIMALS: how precise can my token amounts be?
;; 6 decimals = 1.000000 tokens (learned this matters a lot for trading)
(define-read-only (get-decimals)
	(ok u6)
)

;; GET-BALANCE: check anyone's token balance
;; AMM needs this to verify users have tokens before they try to trade
(define-read-only (get-balance (who principal))
	(ok (ft-get-balance mock-token who))
)

;; GET-TOTAL-SUPPLY: how many tokens exist in the world?
;; since one can mint unlimited tokens, this number grows whenever one mints more
(define-read-only (get-total-supply)
	(ok (ft-get-supply mock-token))
)

;; GET-TOKEN-URI: where to find token info/logo
;; returning 'none' because this is just for learning
(define-read-only (get-token-uri)
	(ok none)
)

;; MINT: create new tokens 
;; it takes in two arguments
;; amount = how many tokens to create
;; recipient = who gets the new tokens  
(define-public (mint (amount uint) (recipient principal))
    (ft-mint? mock-token amount recipient)
)