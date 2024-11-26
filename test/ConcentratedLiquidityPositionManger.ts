import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BaseContract } from "ethers";
import { ethers } from "hardhat";
import { TypedContractEvent, TypedEventLog } from "typechain-types/common";
import type { MintPositionEvent } from "typechain-types/contracts/ConcentratedLiquidityPositionManager";

async function getEventArgs<T extends BaseContract, E extends TypedContractEvent>(
    contract: T,
    eventSignature: string,
) {
    const filter = contract.filters[eventSignature];
    const events = await contract.queryFilter(filter, -1);
    const event = events[0] as TypedEventLog<E>;

    return event.args;
}

async function liquidityManagerFixture() {
    const poolAddress = "0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168"; // DAI/USDC/0.3%

    const token0WhaleAddress = "0xDef1Ed6a770128Ea575A14C51Fce38bc7A0deCEf"; // DAI
    const token1WhaleAddress = "0x2C786311eb154bFeA0399De214C3e71ebbF28F03"; // USDC

    const nonfungiblePositionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

    const [owner, liquidityProvider] = await ethers.getSigners();

    const token0Whale = await ethers.getImpersonatedSigner(token0WhaleAddress);
    const token1Whale = await ethers.getImpersonatedSigner(token1WhaleAddress);

    const poolContract = await ethers.getContractAt("IUniswapV3Pool", poolAddress);

    const nonfungiblePositionManagerContract = await ethers.getContractAt(
        "INonfungiblePositionManager",
        nonfungiblePositionManagerAddress,
    );

    const liquidityManagerContract = await ethers.deployContract(
        "ConcentratedLiquidityPositionManager",
        [nonfungiblePositionManagerContract],
        owner,
    );

    await liquidityManagerContract.waitForDeployment();

    await setBalance(token0Whale.address, ethers.parseEther("10"));
    await setBalance(token1Whale.address, ethers.parseEther("10"));

    const token0Contract = await ethers.getContractAt(
        "IERC20Decimals",
        await poolContract.token0(),
    );
    const token1Contract = await ethers.getContractAt(
        "IERC20Decimals",
        await poolContract.token1(),
    );

    let token0Decimals;
    let token1Decimals;

    try {
        token0Decimals = await token0Contract.decimals();
        token1Decimals = await token1Contract.decimals();
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch token decimals");
    }

    const tx = await token0Contract // DAI
        .connect(token0Whale)
        .transfer(liquidityProvider.address, ethers.parseUnits("10000", token0Decimals));

    const tx2 = await token1Contract // USDC
        .connect(token1Whale)
        .transfer(liquidityProvider.address, ethers.parseUnits("10000", token1Decimals));

    await tx.wait();
    await tx2.wait();

    return {
        liquidityManagerContract,
        liquidityProvider,
        nonfungiblePositionManagerContract,
        owner,
        poolContract,
        token0Contract,
        token0Decimals,
        token1Contract,
        token1Decimals,
    };
}

async function loadLiquidityManagerFixture() {
    return await loadFixture(liquidityManagerFixture);
}

describe("ConcentratedLiquidityPositionManger", async function () {
    describe("constructor", async function () {
        it("should create contract with NonfungiblePositionManager", async function () {
            const { liquidityManagerContract, nonfungiblePositionManagerContract } =
                await loadLiquidityManagerFixture();

            expect(await liquidityManagerContract.nonfanfungiblePositionManager()).equal(
                nonfungiblePositionManagerContract,
            );
        });
    });

    describe("addPosition", async function () {
        it("should revert on zero pool address", async function () {
            const { liquidityManagerContract, liquidityProvider } =
                await loadLiquidityManagerFixture();

            await expect(
                liquidityManagerContract.connect(liquidityProvider).mintNewPosition(
                    ethers.ZeroAddress,
                    {
                        token0: 0,
                        token1: 0,
                    },
                    4000,
                ),
            ).revertedWith("zero address");
        });

        it("should revert on zero token0 amount", async function () {
            const { liquidityManagerContract, liquidityProvider, poolContract } =
                await loadLiquidityManagerFixture();

            await expect(
                liquidityManagerContract.connect(liquidityProvider).mintNewPosition(
                    await poolContract.getAddress(),
                    {
                        token0: 0,
                        token1: 1,
                    },
                    4000,
                ),
            ).revertedWith("zero amount");
        });

        it("should revert on zero width value", async function () {
            const { liquidityManagerContract, liquidityProvider, poolContract } =
                await loadLiquidityManagerFixture();

            await expect(
                liquidityManagerContract.connect(liquidityProvider).mintNewPosition(
                    await poolContract.getAddress(),
                    {
                        token0: 1,
                        token1: 1,
                    },
                    0,
                ),
            ).revertedWith("zero width");
        });

        it("should mint position with given amounts", async function () {
            const {
                token0Contract,
                liquidityManagerContract,
                liquidityProvider,
                poolContract,
                token1Contract,
                token0Decimals,
                token1Decimals,
            } = await loadLiquidityManagerFixture();

            const token0Amount = ethers.parseUnits("1000", token0Decimals); // DAI
            const token1Amount = ethers.parseUnits("2000", token1Decimals); // USDC

            const tx1 = await token0Contract
                .connect(liquidityProvider)
                .approve(liquidityManagerContract, token0Amount);

            const tx2 = await token1Contract
                .connect(liquidityProvider)
                .approve(liquidityManagerContract, token1Amount);

            await tx1.wait();
            await tx2.wait();

            const tx3 = await liquidityManagerContract.connect(liquidityProvider).mintNewPosition(
                await poolContract.getAddress(),
                {
                    token0: token0Amount,
                    token1: token1Amount,
                },
                4000,
            );

            await tx3.wait();

            const eventParameters = await getEventArgs<
                typeof liquidityManagerContract,
                MintPositionEvent.Event
            >(liquidityManagerContract, "MintPosition(uint256,uint256,uint256)");

            console.log("Minted position:", {
                token0Amount: ethers.formatUnits(eventParameters.amount0, token0Decimals),
                token1Amount: ethers.formatUnits(eventParameters.amount1, token1Decimals),
                tokenId: eventParameters.tokenId,
            });

            expect(eventParameters.amount0).gte((token0Amount * 95n) / 100n);
            expect(eventParameters.amount1).gte((token1Amount * 95n) / 100n);
            expect(eventParameters.tokenId).equal(862_439n);
        });
    });
});
