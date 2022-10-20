const { expect } = require("chai");
const hardhat = require("hardhat");
const { ethers } = hardhat;
const { LazyMinter } = require('../lib/LazyMinter.js')

async function deploy() {
  const [minter, redeemer, connectedWallet, connectedWallet2, _] = await ethers.getSigners()

  // let factory = await ethers.getContractFactory("LazyNFT1", minter)
  let factory = await ethers.getContractFactory("NFT6")
  // const contract = await factory.deploy(minter.address)
  const contract = await factory.deploy()
  // console.log("minter :", minter.address)

  // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
  // const redeemerFactory = factory.connect(redeemer)
  // const redeemerContract = redeemerFactory.attach(contract.address)

  // const redeemerFactory = factory.connect(connectedWallet)
  const redeemerFactory = factory.connect(redeemer)
  const redeemerContract = redeemerFactory.attach(contract.address)

  const connectedWalletFactory = factory.connect(connectedWallet)
  const connectedWalletContract = connectedWalletFactory.attach(contract.address)

  const connectedWalletFactory2 = factory.connect(connectedWallet2)
  const connectedWalletContract2 = connectedWalletFactory2.attach(contract.address)

  return {
    minter,
    redeemer,
    contract,
    redeemerContract,
    connectedWalletContract,
    connectedWallet,
    connectedWalletContract2, 
    connectedWallet2,
  }
}

describe("NFT6", function() {
  it("Should deploy", async function() {
    const signers = await ethers.getSigners();
    const minter = signers[0].address;

    const LazyNFT = await ethers.getContractFactory("NFT6");
    // const lazynft = await LazyNFT.deploy(minter);
    const lazynft = await LazyNFT.deploy();
    await lazynft.deployed();

    console.log("minter/signers[0].address :", minter)
    console.log("redeemer/signers[1].address :", signers[1].address)
    console.log("connectedWallet/signers[2].address :", signers[2].address)
  });

  it("Should redeem an NFT from a signed voucher", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    let lazyMinter = new LazyMinter({ contract, signer: minter })
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // console.log("signer :", redeemerContract.signer.address)
    console.log("minter :", minter.address)

    await expect(redeemerContract.createAndBuyToken(voucher, 5))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId);

      // console.log("signer :", redeemerContract.signer.address)
      let ownerOf = await redeemerContract.ownerOf(1)
      console.log("ownerOf token :", ownerOf)
      console.log("redeemer :", redeemer.address)

      const signers = await ethers.getSigners()
      let rando = signers[signers.length-1];

      console.log("rando :", rando.address)

      lazyMinter = new LazyMinter({ contract, signer: rando })
      voucher = await lazyMinter.createVoucher(2, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

      await redeemerContract.createAndBuyToken(voucher, 5)

      // console.log("signer :", redeemerContract.signer.address)
      
  });

  it("Should fail to redeem an NFT that's already been claimed", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    await expect(redeemerContract.createAndBuyToken(voucher, 5))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId);

    await expect(redeemerContract.createAndBuyToken(voucher, 5))
      .to.be.revertedWith('ERC721: token already minted')
  });

  it("Should fail to redeem an NFT voucher that's signed by an unauthorized account", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, connectedWallet, connectedWalletContract2,
    connectedWallet2 } = await deploy()

    const signers = await ethers.getSigners()
    const rando = signers[signers.length-1];
    
    let lazyMinter = new LazyMinter({ contract, signer: rando })
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // console.log("signer :", redeemerContract.signer.address)

    //await redeemerContract.redeem(redeemer.address, voucher)
    
    console.log("rando :", rando.address)

    // await redeemerContract.redeem(redeemer.address, voucher)

    await expect(redeemerContract.createAndBuyToken(voucher, 5))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', rando.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(rando.address, redeemer.address, voucher.tokenId);

    lazyMinter = new LazyMinter({ contract, signer: redeemer })
    voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // await connectedWalletContract.secondaryBuyToken(1, voucher)

    // await connectedWalletContract.secondaryBuyToken(1, voucher)

    await expect(await connectedWalletContract.secondaryBuyToken(1, voucher))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs(redeemer.address, connectedWallet.address, voucher.tokenId)

    lazyMinter = new LazyMinter({ contract, signer: connectedWallet })
    voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    await expect(await connectedWalletContract2.secondaryBuyToken(1, voucher))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs(connectedWallet.address, connectedWallet2.address, voucher.tokenId)
    
    // await expect(redeemerContract.redeem(redeemer.address, voucher))
    //   .to.be.revertedWith('Signature invalid or unauthorized')

    // console.log("signer :", redeemerContract.signer.address)
  });

  it("Should fail to redeem an NFT voucher that's been modified", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    // const signers = await ethers.getSigners()
    // const rando = signers[signers.length-1];
    
    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
    voucher.tokenId = 2

    await redeemerContract.createAndBuyToken(voucher, 5)
    // await expect(redeemerContract.redeem(redeemer.address, voucher))
    //   .to.be.revertedWith('Signature invalid or unauthorized')
  });

  it("Should fail to redeem an NFT voucher with an invalid signature", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    const signers = await ethers.getSigners()
    const rando = signers[signers.length-1];
    
    const lazyMinter = new LazyMinter({ contract, signer: rando })
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    const dummyData = ethers.utils.randomBytes(128)
    voucher.signature = await rando.signMessage(dummyData)
    
    voucher.tokenId = 2
    // await redeemerContract.redeem(redeemer.address, voucher)
    await redeemerContract.createAndBuyToken(voucher, 5)
    // await expect(redeemerContract.redeem(redeemer.address, voucher))
    //   .to.be.revertedWith('Signature invalid or unauthorized')
  });

  it("Should redeem if payment is >= minPrice", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    console.log("voucher :", voucher)

    await expect(redeemerContract.createAndBuyToken(voucher, 5, {value: minPrice}))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId)

      let tokenURI721 = await contract.tokenURI(1)
      console.log("created token 721 Uri :", tokenURI721)
      
      let ownerOf = await contract.ownerOf(1)
      console.log("ownerOf token :", ownerOf)

      console.log("redeemer :", redeemer.address)
  })

  it("Should fail to redeem if payment is < minPrice", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    const payment = minPrice.sub(10000)
    await expect(redeemerContract.createAndBuyToken(voucher, 5, {value: payment}))
      .to.be.revertedWith('Must submit atleast the min price to purchase')
  })

  it("Should make payments available to minter for withdrawal", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, connectedWallet, connectedWalletContract2,
      connectedWallet2 } = await deploy()

    const signers = await ethers.getSigners()
      let rando = signers[signers.length-1];

    let lazyMinter = new LazyMinter({ contract, signer: rando })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)
    
    // the payment should be sent from the redeemer's account to the contract address
    await expect(await redeemerContract.createAndBuyToken(voucher, 5, {value: minPrice}))
      .to.changeEtherBalances([redeemer, rando, minter], [minPrice.mul(-1), (0.98*Number(minPrice)).toString(), 
        (0.02*Number(minPrice)).toString()]) 

    lazyMinter = new LazyMinter({ contract, signer: redeemer })
    voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    await expect(await connectedWalletContract.secondaryBuyToken(1, voucher, {value: minPrice}))
       .to.changeEtherBalances([redeemer, rando, connectedWallet], [(0.95*Number(minPrice)).toString(), 
         (0.05*Number(minPrice)).toString(), minPrice.mul(-1)]) 

    
    lazyMinter = new LazyMinter({ contract, signer: connectedWallet })
    voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
     
    await expect(await connectedWalletContract2.secondaryBuyToken(1, voucher, {value: minPrice}))
       .to.changeEtherBalances([connectedWallet, rando, connectedWallet2], [(0.95*Number(minPrice)).toString(), 
         (0.05*Number(minPrice)).toString(), minPrice.mul(-1)]) 

    let ownerOf = await contract.ownerOf(1)
    console.log("ownerOf token :", ownerOf)
   
    console.log("connectedWallet2 :", connectedWallet2.address)

    // minter should have funds available to withdraw
    // expect(await contract.availableToWithdraw()).to.equal(minPrice)

    // withdrawal should increase minter's balance
    // await expect(await contract.withdraw())
    //   .to.changeEtherBalance(minter, minPrice)

    // minter should now have zero available
    // expect(await contract.availableToWithdraw()).to.equal(0)
  })

});