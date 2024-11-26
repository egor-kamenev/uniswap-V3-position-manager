import { HardhatUserConfig, vars } from "hardhat/config";
import "tsconfig-paths/register"; // This adds support for typescript paths mappings
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            allowBlocksWithSameTimestamp: true,
            forking: {
                blockNumber: 21_244_247,
                url: vars.get("MAINNET_RPC_URL"),
            },
        },
    },
    solidity: "0.7.6",
};

export default config;
