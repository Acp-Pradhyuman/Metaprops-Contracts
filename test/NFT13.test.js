const { expect } = require("chai");
const hardhat = require("hardhat");
const { ethers } = hardhat;
const { LazyMinter } = require('../lib/LazyMinter.js')

const wait = (seconds) => {
  const milliseconds = seconds * 1000
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function deploy() {
  const [minter, redeemer, connectedWallet, connectedWallet2, _] = await ethers.getSigners()

  // let factory = await ethers.getContractFactory("LazyNFT1", minter)
  let factory = await ethers.getContractFactory("NFT13")
  let factory2 = await ethers.getContractFactory("WETH9")
  let factory3 = await ethers.getContractFactory("Resale")
  // const contract = await factory.deploy(minter.address)
  const contract = await factory.deploy(minter.address)
  const token = await factory2.deploy()
  const contract2 = await factory3.deploy(minter.address)
  // console.log("minter :", minter.address)

  // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
  // const redeemerFactory = factory.connect(redeemer)
  // const redeemerContract = redeemerFactory.attach(contract.address)

  // const redeemerFactory = factory.connect(connectedWallet)
  const minterFactory = factory.connect(minter)
  const minterContract = minterFactory.attach(contract.address)
  const minterToken = minterFactory.attach(token.address)

  const redeemerFactory = factory.connect(redeemer)
  const redeemerContract = redeemerFactory.attach(contract.address)
  const redeemerResaleContract = redeemerFactory.attach(contract2.address)
  const redeemerToken = redeemerFactory.attach(token.address)

  const connectedWalletFactory = factory.connect(connectedWallet)
  const connectedWalletContract = connectedWalletFactory.attach(contract.address)
  const connectedWalletResaleContract = connectedWalletFactory.attach(contract2.address)
  const connectedWalletToken = connectedWalletFactory.attach(token.address)

  const connectedWalletFactory2 = factory.connect(connectedWallet2)
  const connectedWalletContract2 = connectedWalletFactory2.attach(contract.address)
  const connectedWalletResaleContract2 = connectedWalletFactory2.attach(contract2.address)
  const connectedWalletToken2 = connectedWalletFactory2.attach(token.address)

  return {
    minter,
    redeemer,
    contract,
    contract2,
    token,
    minterContract,
    minterToken,
    redeemerContract,
    redeemerResaleContract,
    redeemerToken,
    connectedWalletContract,
    connectedWalletResaleContract,
    connectedWalletToken,
    connectedWallet,
    connectedWalletContract2,
    connectedWalletResaleContract2,
    connectedWalletToken2,
    connectedWallet2,
  }
}

describe("NFT13", function() {
  it("Should deploy", async function() {
    const signers = await ethers.getSigners();
    const minter = signers[0].address;

    const LazyNFT = await ethers.getContractFactory("NFT13");
    // const lazynft = await LazyNFT.deploy(minter);
    const lazynft = await LazyNFT.deploy(minter);
    await lazynft.deployed();

    console.log("minter/signers[0].address :", minter)
    console.log("redeemer/signers[1].address :", signers[1].address)
    console.log("connectedWallet/signers[2].address :", signers[2].address)
  });

  it("Should redeem an NFT from a signed voucher", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, token } = await deploy()

    let lazyMinter = new LazyMinter({ contract, signer: minter })
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // console.log("signer :", redeemerContract.signer.address)
    console.log("minter :", minter.address)

    await expect(redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address))
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

      await redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address);

      // console.log("signer :", redeemerContract.signer.address)

  });

  it("Should fail to redeem an NFT that's already been claimed", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, token } = await deploy()

    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    await expect(redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', minter.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(minter.address, redeemer.address, voucher.tokenId);

    await expect(redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address))
      .to.be.revertedWith('ERC721: token already minted')
  });

  it("Should fail to redeem an NFT voucher that's signed by an unauthorized account", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, connectedWallet, connectedWalletContract2,
    connectedWallet2, token } = await deploy()

    const signers = await ethers.getSigners()
    const rando = signers[signers.length-1];

    let lazyMinter = new LazyMinter({ contract, signer: rando })
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // console.log("signer :", redeemerContract.signer.address)

    //await redeemerContract.redeem(redeemer.address, voucher)

    console.log("rando :", rando.address)

    // await redeemerContract.redeem(redeemer.address, voucher)

    await expect(redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address))
      .to.emit(contract, 'Transfer')  // transfer from null address to minter
      .withArgs('0x0000000000000000000000000000000000000000', rando.address, voucher.tokenId)
      .and.to.emit(contract, 'Transfer') // transfer from minter to redeemer
      .withArgs(rando.address, redeemer.address, voucher.tokenId);

    lazyMinter = new LazyMinter({ contract, signer: redeemer })
    voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // await connectedWalletContract.secondaryBuyToken(1, voucher)

    // await connectedWalletContract.secondaryBuyToken(1, voucher)

    // await expect(await connectedWalletContract.secondaryBuyToken(1, voucher))
    //   .to.emit(contract, 'Transfer')  // transfer from null address to minter
    //   .withArgs(redeemer.address, connectedWallet.address, voucher.tokenId)

    // lazyMinter = new LazyMinter({ contract, signer: connectedWallet })
    // voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    // await expect(await connectedWalletContract2.secondaryBuyToken(1, voucher))
    //   .to.emit(contract, 'Transfer')  // transfer from null address to minter
    //   .withArgs(connectedWallet.address, connectedWallet2.address, voucher.tokenId)

    // await expect(redeemerContract.redeem(redeemer.address, voucher))
    //   .to.be.revertedWith('Signature invalid or unauthorized')

    // console.log("signer :", redeemerContract.signer.address)
  });

  it("Should fail to redeem an NFT voucher that's been modified", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, token } = await deploy()

    // const signers = await ethers.getSigners()
    // const rando = signers[signers.length-1];

    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
    voucher.tokenId = 2

    await redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address)
    // await expect(redeemerContract.redeem(redeemer.address, voucher))
    //   .to.be.revertedWith('Signature invalid or unauthorized')
  });

  it("Should fail to redeem an NFT voucher with an invalid signature", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract, token } = await deploy()

    const signers = await ethers.getSigners()
    const rando = signers[signers.length-1];

    const lazyMinter = new LazyMinter({ contract, signer: rando })
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")

    const dummyData = ethers.utils.randomBytes(128)
    voucher.signature = await rando.signMessage(dummyData)

    voucher.tokenId = 2
    // await redeemerContract.redeem(redeemer.address, voucher)
    await redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address)
    // await expect(redeemerContract.redeem(redeemer.address, voucher))
    //   .to.be.revertedWith('Signature invalid or unauthorized')
  });

  it("Should redeem if payment is >= minPrice", async function() {
    const { contract, redeemerContract, redeemer, minter, connectedWalletContract } = await deploy()

    const lazyMinter = new LazyMinter({ contract, signer: minter })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    console.log("voucher :", voucher)

    await expect(redeemerContract.createAndBuyTokenWETH(voucher, 5, '0x0000000000000000000000000000000000000000', {value: minPrice}))
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
    // redeemerContract.createAndBuyTokenWETH(voucher, 5, '0x0000000000000000000000000000000000000000', {value: payment})
    await expect(redeemerContract.createAndBuyTokenWETH(voucher, 5, '0x0000000000000000000000000000000000000000', {value: minPrice}))
      .to.be.revertedWith('Must submit atleast the min price to purchase')
  })

  it("Should make payments available to minter for withdrawal", async function() {
    const { contract, token, redeemerContract, redeemer, redeemerToken, minter, minterToken, connectedWalletContract, connectedWallet,
      connectedWalletContract2, connectedWallet2 } = await deploy()

    const signers = await ethers.getSigners()
    let rando = signers[signers.length-1];

    let lazyMinter = new LazyMinter({ contract, signer: rando })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // the payment should be sent from the redeemer's account to the contract address
    await expect(await redeemerContract.createAndBuyTokenWETH(voucher, 5, '0x0000000000000000000000000000000000000000', {value: minPrice}))
      .to.changeEtherBalances([redeemer, rando, minter], [minPrice.mul(-1), (0.98*Number(minPrice)).toString(),
        (0.02*Number(minPrice)).toString()])

    lazyMinter = new LazyMinter({ contract, signer: redeemer })
    voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // await expect(await connectedWalletContract.secondaryBuyToken(1, voucher, {value: minPrice}))
    //    .to.changeEtherBalances([redeemer, rando, connectedWallet], [(0.95*Number(minPrice)).toString(),
    //      (0.05*Number(minPrice)).toString(), minPrice.mul(-1)])


    // lazyMinter = new LazyMinter({ contract, signer: connectedWallet })
    // voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // await expect(await connectedWalletContract2.secondaryBuyToken(1, voucher, {value: minPrice}))
    //    .to.changeEtherBalances([connectedWallet, rando, connectedWallet2], [(0.95*Number(minPrice)).toString(),
    //      (0.05*Number(minPrice)).toString(), minPrice.mul(-1)])

    // let ownerOf = await contract.ownerOf(1)
    // console.log("ownerOf token :", ownerOf)

    // console.log("connectedWallet2 :", connectedWallet2.address)
  })

  it("Should make payments available to minter for withdrawal", async function() {
    const { contract, token, redeemerContract, redeemer, redeemerToken, minter, minterToken, connectedWalletContract,
      connectedWalletToken, connectedWallet, connectedWalletContract2, connectedWalletToken2, connectedWallet2 } = await deploy()

    const signers = await ethers.getSigners()
    let rando = signers[signers.length-1];
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth

    let balance = await token.balanceOf(minter.address)
    console.log("balance of minter before transfer : ", balance.toString())

    balance = await token.balanceOf(rando.address)
    console.log("balance of rando before buy : ", balance.toString())

    await token.transfer(redeemer.address, '100000000000000000000', {from: minter.address})
    await token.transfer(connectedWallet.address, '100000000000000000000', {from: minter.address})
    await token.transfer(connectedWallet2.address, '100000000000000000000', {from: minter.address})

    balance = await token.balanceOf(minter.address)
    console.log("balance of minter after transfer and before buy : ", balance.toString())

    let lazyMinter = new LazyMinter({ contract, signer: rando })
    voucher = await lazyMinter.createVoucher(2, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    await redeemerToken.approve(contract.address, minPrice)
    await redeemerContract.createAndBuyTokenWETH(voucher, 5, token.address, {value: minPrice})

    balance = await token.balanceOf(redeemer.address)
    console.log("balance of redeemer after buy : ", balance.toString())

    balance = await token.balanceOf(minter.address)
    console.log("balance of minter after buy : ", balance.toString())

    console.log("/////.....secondary buy 1...../////")

    balance = await token.balanceOf(rando.address)
    console.log("balance of rando after buy and before secondary buy : ", balance.toString())

    balance = await token.balanceOf(redeemer.address)
    console.log("balance of redeemer before secondary buy : ", balance.toString())

    ownerOf = await contract.ownerOf(2)
    console.log("ownerOf token :", ownerOf)

    lazyMinter = new LazyMinter({ contract, signer:  redeemer})
    voucher = await lazyMinter.createVoucher(3, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    balance = await token.balanceOf(connectedWallet.address)
    console.log("balance of connectedWallet before secondary buy : ", balance.toString())

    await redeemerContract.start(3, minPrice, 10, token.address, 5)

    await connectedWalletToken.approve(contract.address, '2000000000000000000')
    await connectedWalletContract.bid(2, '2000000000000000000')

    await connectedWalletToken2.approve(contract.address, '10000000000000000000')
    await connectedWalletContract2.bid(2, '10000000000000000000')

    balance = await token.balanceOf(connectedWallet.address)
    console.log("balance of connectedWallet : ", balance.toString())

    await wait(1)
    // await redeemerContract.end(voucher, connectedWallet.address)
    await redeemerContract.end(2, voucher, '0x0000000000000000000000000000000000000000')

    await connectedWalletContract.withdraw(2,3)

    balance = await token.balanceOf(redeemer.address)
    console.log("balance of redeemer : ", balance.toString())

    balance = await token.balanceOf(minter.address)
    console.log("balance of minter : ", balance.toString())

    balance = await token.balanceOf(connectedWallet.address)
    console.log("balance of connectedWallet : ", balance.toString())

    // function start(
    //   uint256 _nftId,
    //   uint256 startingBid,
    //   uint256 auctionPeriodInDays,
    //   address _token
    // )

    //bid(uint256 _nftId, uint256 amount)

    //end(NFTVoucher calldata voucher, address bidder)



    // await connectedWalletToken.approve(contract.address, minPrice)
    // await connectedWalletContract.secondaryBuyTokenWETH(1, voucher)

    // balance = await token.balanceOf(rando.address)
    // console.log("balance of rando after secondary buy : ", balance.toString())

    // balance = await token.balanceOf(redeemer.address)
    // console.log("balance of redeemer after secondary buy : ", balance.toString())

    // balance = await token.balanceOf(connectedWallet.address)
    // console.log("balance of connectedWallet after secondary buy : ", balance.toString())

    // //////////////////////////////////////////////////////////////////////////////////////

    // console.log("/////.....secondary buy 2...../////")

    // lazyMinter = new LazyMinter({ contract, signer:  connectedWallet})
    // voucher = await lazyMinter.createVoucher(2, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // balance = await token.balanceOf(connectedWallet2.address)
    // console.log("balance of connectedWallet2 before secondary buy : ", balance.toString())

    // await connectedWalletToken2.approve(contract.address, minPrice)
    // await connectedWalletContract2.secondaryBuyTokenWETH(1, voucher)

    // balance = await token.balanceOf(rando.address)
    // console.log("balance of rando after secondary buy : ", balance.toString())

    // balance = await token.balanceOf(redeemer.address)
    // console.log("balance of redeemer after secondary buy : ", balance.toString())

    // balance = await token.balanceOf(connectedWallet.address)
    // console.log("balance of connectedWallet after secondary buy : ", balance.toString())

    // balance = await token.balanceOf(connectedWallet2.address)
    // console.log("balance of connectedWallet2 after secondary buy : ", balance.toString())

    // lazyMinter = new LazyMinter({ contract, signer: redeemer })
    // voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // await expect(await connectedWalletContract.createAndBuyTokenWETH(voucher, 5, {value: minPrice}))
    //    .to.changeEtherBalances([redeemer, minter, connectedWallet], [(0.98*Number(minPrice)).toString(),
    //      (0.02*Number(minPrice)).toString(), minPrice.mul(-1)])

    // lazyMinter = new LazyMinter({ contract, signer: connectedWallet })
    // voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // await expect(await connectedWalletContract2.secondaryBuyToken(2, voucher, {value: minPrice}))
    //   .to.changeEtherBalances([connectedWallet, redeemer, connectedWallet2], [(0.95*Number(minPrice)).toString(),
    //     (0.05*Number(minPrice)).toString(), minPrice.mul(-1)])



    // minter should have funds available to withdraw
    // expect(await contract.availableToWithdraw()).to.equal(minPrice)

    // withdrawal should increase minter's balance
    // await expect(await contract.withdraw())
    //   .to.changeEtherBalance(minter, minPrice)

    // minter should now have zero available
    // expect(await contract.availableToWithdraw()).to.equal(0)
  })

  it("resale", async function() {
    const { contract, contract2, token, redeemerContract, redeemer, minter, redeemerResaleContract, minterContract,
      connectedWallet, connectedWalletResaleContract} = await deploy()

    const signers = await ethers.getSigners()
    let rando = signers[signers.length-1];

    let lazyMinter = new LazyMinter({ contract, signer: rando })
    const minPrice = ethers.constants.WeiPerEther // charge 1 Eth
    let voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)

    // the payment should be sent from the redeemer's account to the contract address
    await expect(await redeemerContract.createAndBuyTokenWETH(voucher, 5, '0x0000000000000000000000000000000000000000', {value: minPrice}))
      .to.changeEtherBalances([redeemer, rando, minter], [minPrice.mul(-1), (0.98*Number(minPrice)).toString(),
        (0.02*Number(minPrice)).toString()])

    // lazyMinter = new LazyMinter({ contract, signer: redeemer })
    // voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", minPrice)


    await redeemerContract.setSellerAndFixedPrice(1, minPrice)
    // await redeemerResaleContract.secondarySale(contract.address, 1)

    // await connectedWalletResaleContract.secondaryBuy(1, contract.address)
    // await minterContract.setOwner(1, connectedWallet.address)

    console.log("resale contract address: ", redeemerResaleContract.address)
    let NFTroyalty = await redeemerResaleContract.getNFTRoyalty
    console.log("NFTroyalty: ", NFTroyalty)


    ////////////////////////////////////
    // const Item = await ethers.getContractFactory("Item")
    // await Item.deploy(marketAddress)
    // const nft = await nft.deployed()
    // await nft.createToken("https://www.mytokenlocation.com")




  })

});