import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedDonateContract = await  deploy("DonateContract", {
    from: deployer,
    log: true,
  });
  

  console.log(`DonateContract contract: `, deployedDonateContract.address);
 
};
export default func;
func.id = "deploy"; // id required to prevent reexecution
func.tags = ["DonateContract"];
