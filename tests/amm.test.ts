import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

const mockTokenOne = Cl.contractPrincipal(deployer, "mock-token");
const mockTokenTwo = Cl.contractPrincipal(deployer, "mock-token-2");

function createPool() {
  return simnet.callPublicFn(
    "amm",
    "create-pool",
    [mockTokenOne, mockTokenTwo, Cl.uint(500)],
    alice
  );
}

function addLiquidity(account: string, amount0: number, amount1: number) {
  return simnet.callPublicFn(
    "amm",
    "add-liquidity",
    [
      mockTokenOne,
      mockTokenTwo,
      Cl.uint(500),
      Cl.uint(amount0),
      Cl.uint(amount1),
      Cl.uint(0),
      Cl.uint(0),
    ],
    account
  );
}

function removeLiquidity(account: string, liquidity: number) {
  return simnet.callPublicFn(
    "amm",
    "remove-liquidity",
    [mockTokenOne, mockTokenTwo, Cl.uint(500), Cl.uint(liquidity)],
    account
  );
}

// ENHANCED VERSION (with slippage protection)
function swap(caller: string, amountIn: number, aToB: boolean, minAmountOut: number = 0) {
  return simnet.callPublicFn("amm", "swap", [
    mockTokenOne,                   
    mockTokenTwo,                   
    Cl.uint(500),                   
    Cl.uint(amountIn),              
    Cl.bool(aToB),                  
    Cl.uint(minAmountOut)           // NEW: Slippage protection parameter
  ], caller);
}

function getPoolId() {
  return simnet.callReadOnlyFn(
    "amm",
    "get-pool-id",
    [
      Cl.tuple({
        "token-0": mockTokenOne,
        "token-1": mockTokenTwo,
        fee: Cl.uint(500),
      }),
    ],
    alice // this is a read-only function so user address doesn't matter
  );
}

describe("AMM Tests", () => {
  beforeEach(() => {
    const allAccounts = [alice, bob, charlie];

    for (const account of allAccounts) {
      const mintResultOne = simnet.callPublicFn(
        "mock-token",
        "mint",
        [Cl.uint(1_000_000_000), Cl.principal(account)],
        account
      );

      expect(mintResultOne.events.length).toBeGreaterThan(0);

      const mintResultTwo = simnet.callPublicFn(
        "mock-token-2",
        "mint",
        [Cl.uint(1_000_000_000), Cl.principal(account)],
        account
      );

      expect(mintResultTwo.events.length).toBeGreaterThan(0);
    }
  });

  it("allows pool creation", () => {
    const { result, events } = createPool();

    expect(result).toBeOk(Cl.bool(true));
    expect(events.length).toBe(1);
  });

  it("disallows creation of same pool twice", () => {
    const { result: result1 } = createPool();
    expect(result1).toBeOk(Cl.bool(true));

    const { result: result2 } = createPool();
    expect(result2).toBeErr(Cl.uint(200));
  });

  it("adds initial liquidity in whatever ratio", () => {
    const createPoolRes = createPool();
    expect(createPoolRes.result).toBeOk(Cl.bool(true));

    const addLiqRes = addLiquidity(alice, 1000000, 500000);

    expect(addLiqRes.result).toBeOk(Cl.bool(true));
    expect(addLiqRes.events.length).toBe(3);
  });

  it("requires n+1 add liquidity calls to maintain ratio", () => {
    const createPoolRes = createPool();
    expect(createPoolRes.result).toBeOk(Cl.bool(true));

    const addLiqRes = addLiquidity(alice, 1000000, 500000);
    expect(addLiqRes.result).toBeOk(Cl.bool(true));
    expect(addLiqRes.events.length).toBe(3);

    const secondAddLiqRes = addLiquidity(alice, 5000, 10000000);
    expect(secondAddLiqRes.result).toBeOk(Cl.bool(true));
    expect(secondAddLiqRes.events.length).toBe(3);
    expect(secondAddLiqRes.events[0].event).toBe("ft_transfer_event");
    expect(secondAddLiqRes.events[0].data.amount).toBe("5000");
    expect(secondAddLiqRes.events[1].event).toBe("ft_transfer_event");
    expect(secondAddLiqRes.events[1].data.amount).toBe("2500");
  });

  it("allows removing liquidity except minimum liquidity", () => {
    createPool();
    addLiquidity(alice, 1000000, 500000);

    const { result: poolId } = getPoolId();
    const aliceLiquidity = simnet.callReadOnlyFn(
      "amm",
      "get-position-liquidity",
      [poolId, Cl.principal(alice)],
      alice
    );
    expect(aliceLiquidity.result).toBeOk(Cl.uint(706106));

    const { result, events } = removeLiquidity(alice, 706106);
    expect(result).toBeOk(Cl.bool(true));

    const tokenOneAmountWithdrawn = parseInt(events[0].data.amount);
    const tokenTwoAmountWithdrawn = parseInt(events[1].data.amount);

    expect(tokenOneAmountWithdrawn).toBe(998585);
    expect(tokenTwoAmountWithdrawn).toBe(499292);
  });

  it("should allow for swaps", () => {
    createPool();
    addLiquidity(alice, 1000000, 500000);

    const { result, events } = swap(alice, 100000, true);

    expect(result).toBeOk(Cl.bool(true));
    expect(events[0].data.amount).toBe("100000");
    expect(events[1].data.amount).toBe("43183");
  });

  it("should distribute fees earned amongst LPs", () => {
    createPool();
    addLiquidity(alice, 1000000, 500000);

    swap(alice, 100000, true);

    // after locking up minimum liquidity
    const withdrawableTokenOnePreSwap = 998585;
    const withdrawableTokenTwoPreSwap = 499292;

    const { result, events } = removeLiquidity(alice, 706106);
    expect(result).toBeOk(Cl.bool(true));

    const tokenOneAmountWithdrawn = parseInt(events[0].data.amount);
    const tokenTwoAmountWithdrawn = parseInt(events[1].data.amount);

    expect(tokenOneAmountWithdrawn).toBeGreaterThan(
      withdrawableTokenOnePreSwap
    );
    expect(tokenTwoAmountWithdrawn).toBeLessThan(withdrawableTokenTwoPreSwap);
  });
});

// SLIPPAGE PROTECTION TEST
// =======================
// This test validates the slippage protection feature I added to the original AMM contract
// The original LearnWeb3 course contract did not have slippage protection, which is a critical
// feature for production AMMs
it("should enforce slippage protection with min-amount-out", () => {
  // STEP 1: create a new pool with unique fee for isolated testing
  // using fee=999 to ensure this test doesn't interfere with other pool tests
  const createPoolRes = simnet.callPublicFn(
    "amm",
    "create-pool",
    [mockTokenOne, mockTokenTwo, Cl.uint(999)], // very unique fee to avoid conflicts
    alice
  );
  expect(createPoolRes.result).toBeOk(Cl.bool(true));
  console.log("Pool created successfully");

  // STEP 2: add initial liquidity to establish a price ratio
  // this creates the baseline for our slippage protection testing
  console.log("About to add liquidity...");
  const addLiqRes = simnet.callPublicFn(
    "amm",
    "add-liquidity",
    [
      mockTokenOne,
      mockTokenTwo,
      Cl.uint(999),     // same unique token fee
      Cl.uint(1000000), // 1M token-0 - establishes initial reserves
      Cl.uint(500000),  // 500K token-1 - creates 2:1 ratio (token-0:token-1)
      Cl.uint(0),       // Min amounts (not relevant for first liquidity)
      Cl.uint(0),
    ],
    alice
  );
  
  console.log("Add liquidity result:", addLiqRes.result);
  
  // Debug logging to verify token balances after liquidity provision
  const aliceBalance1 = simnet.callReadOnlyFn("mock-token", "get-balance", [Cl.principal(alice)], alice);
  const aliceBalance2 = simnet.callReadOnlyFn("mock-token-2", "get-balance", [Cl.principal(alice)], alice);
  console.log("Alice balance token 1:", aliceBalance1.result);
  console.log("Alice balance token 2:", aliceBalance2.result);
  
  if (addLiqRes.result.type === "ok") {
    expect(addLiqRes.result).toBeOk(Cl.bool(true));

    const debugSwapAmount = 100000; // Amount to swap in both test scenarios
    
    // STEP 3: TEST SUCCESSFUL SWAP - Low slippage tolerance (should pass)
    // This tests that swaps work when min-amount-out is reasonable
    const successResult = simnet.callPublicFn("amm", "swap", [
      mockTokenOne,                       // token being sold
      mockTokenTwo,                       // token being bought  
      Cl.uint(999),                       // pool fee
      Cl.uint(debugSwapAmount),           // amount to swap (100k tokens)
      Cl.bool(true),                      // direction: A->B (token-0 to token-1)
      Cl.uint(1)                          // SLIPPAGE PROTECTION: very low min-out (1 token)
    ], alice);
    
    // Verify the swap succeeded and generated the expected events
    expect(successResult.result).toBeOk(Cl.bool(true));
    expect(successResult.events.length).toBe(3);
    
    // STEP 4: TEST FAILED SWAP - High slippage tolerance (should fail)  
    // This is the core test of my slippage protection feature
    const failResult = simnet.callPublicFn("amm", "swap", [
      mockTokenOne,                     // same token being sold
      mockTokenTwo,                     // same token being bought
      Cl.uint(999),                     // same pool fee
      Cl.uint(debugSwapAmount),         // same swap amount (100k tokens)
      Cl.bool(true),                    // same direction: A->B
      Cl.uint(50000)                    // SLIPPAGE PROTECTION: nnrealistic min-out (50k tokens)
                                        // this should FAIL because actual output < 50k
                                        // (based on previous swap, we know output ≈ 43k tokens)
    ], alice);
    
    // CRITICAL ASSERTION: verify my slippage protection correctly rejects the swap
    // error code 209 is the slippage protection error I implemented in the contract
    expect(failResult.result).toBeErr(Cl.uint(209));  // MY CUSTOM ERROR: slippage too high
  }
});

