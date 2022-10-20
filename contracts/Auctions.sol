// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Auction {
    using SafeERC20 for IERC20;
    mapping(uint256 => address) public seller;
    mapping(uint256 => bool) public started;
    mapping(uint256 => bool) public ended;
    mapping(uint256 => uint256) public endAt;
    mapping(uint256 => uint256) public highestBid;
    mapping(uint256 => address) public highestBidder;
    mapping(uint256 => mapping(address => uint256)) public bids;
    mapping(uint256 => address) public auctionPurchaseToken;

    event Start(uint256 tokenId);
    event Bid(uint256 tokenId, address indexed sender, uint256 amount);
    event Withdraw(uint256 tokenId, address indexed bidder, uint256 amount);
    event End(uint256 tokenId, address highestBidder, uint256 highestBid);

    function start(
        uint256 _nftId,
        uint256 startingBid,
        uint256 auctionPeriodInDays,
        address _token,
        address caller
    ) public {
        require(!started[_nftId], "Already started!");
        seller[_nftId] = caller;
        highestBid[_nftId] = startingBid;
        started[_nftId] = true;
        endAt[_nftId] = block.timestamp + (auctionPeriodInDays * 1 days);
        auctionPurchaseToken[_nftId] = _token;
        emit Start(_nftId);
    }

    function bid(
        uint256 _nftId,
        uint256 amount,
        address caller,
        uint256 maticValue
    ) public {
        uint256 currentBid;

        if (auctionPurchaseToken[_nftId] == address(0)) {
            currentBid = bids[_nftId][caller] + maticValue;
            require(
                currentBid > highestBid[_nftId],
                "bid value must be more than highest bid"
            );
        } else {
            IERC20 paymentToken = IERC20(auctionPurchaseToken[_nftId]);
            uint256 allowToPayAmount = paymentToken.allowance(
                caller,
                address(this)
            );
            require(allowToPayAmount >= amount, "Invalid token allowance");

            currentBid = bids[_nftId][caller] + amount;
            require(
                currentBid > highestBid[_nftId],
                "bid value must be more than highest bid"
            );
            // Transfer bid
            paymentToken.safeTransferFrom(caller, address(this), amount);
        }

        bids[_nftId][caller] = currentBid;
        highestBid[_nftId] = currentBid;
        highestBidder[_nftId] = caller;
        emit Bid(_nftId, caller, currentBid);
    }

    function end(
        uint256 tokenId,
        address bidder,
        address signer,
        uint256 platformCommission,
        address payable admin
    ) public {
        require(started[tokenId], "You need to start first!");
        require(block.timestamp >= endAt[tokenId], "Auction is still ongoing!");
        require(!ended[tokenId], "Auction already ended!");
        require(
            bids[tokenId][bidder] > 0 || bidder == address(0),
            "Bidder not found"
        );

        // nft.transfer(highestBidder, _nftId); //Transfering the NFT to the winner.

        //     (bool sent, bytes memory data) = seller.call{value: highestBid}(""); // Paying the seller.
        //     require(sent, "Could not pay seller!");

        ended[tokenId] = true;
        // setApprovalForAll(address(this), true); //grant transaction permission to marketplace
        // IERC721(address(this)).transferFrom(seller, address(this), _tokenId);

        if (
            bidder != address(0) && auctionPurchaseToken[tokenId] != address(0)
        ) {
            uint256 commission = (platformCommission * bids[tokenId][bidder]) /
                100;
            uint256 sellerShare = ((100 - platformCommission) *
                bids[tokenId][bidder]) / 100;

            IERC20 paymentToken = IERC20(auctionPurchaseToken[tokenId]);
            paymentToken.transfer(admin, commission);
            paymentToken.transfer(signer, sellerShare);

            bids[tokenId][bidder] = 0;

            emit End(tokenId, bidder, bids[tokenId][bidder]);
        } else if (
            bidder == address(0) && auctionPurchaseToken[tokenId] != address(0)
        ) {
            uint256 commission = (platformCommission * highestBid[tokenId]) /
                100;
            uint256 sellerShare = ((100 - platformCommission) *
                highestBid[tokenId]) / 100;

            IERC20 paymentToken = IERC20(auctionPurchaseToken[tokenId]);
            paymentToken.transfer(admin, commission);
            paymentToken.transfer(signer, sellerShare);
            // admin.transfer(commission);
            // payable(signer).transfer(sellerShare);
            bids[tokenId][highestBidder[tokenId]] = 0;

            emit End(tokenId, highestBidder[tokenId], highestBid[tokenId]);
        } else if (
            bidder != address(0) && auctionPurchaseToken[tokenId] == address(0)
        ) {
            uint256 commission = (platformCommission * bids[tokenId][bidder]) /
                100;
            uint256 sellerShare = ((100 - platformCommission) *
                bids[tokenId][bidder]) / 100;

            admin.transfer(commission);
            payable(signer).transfer(sellerShare);

            bids[tokenId][bidder] = 0;

            emit End(tokenId, bidder, bids[tokenId][bidder]);
        } else {
            uint256 commission = (platformCommission * highestBid[tokenId]) /
                100;
            uint256 sellerShare = ((100 - platformCommission) *
                highestBid[tokenId]) / 100;

            admin.transfer(commission);
            payable(signer).transfer(sellerShare);

            bids[tokenId][highestBidder[tokenId]] = 0;

            emit End(tokenId, highestBidder[tokenId], highestBid[tokenId]);
        }

        //_transferBuy(voucher.minPrice, marketItemId, msg.sender);
    }

    function withdraw(uint256 _nftId) public {
        require(ended[_nftId], "Auction not ended yet!");
        uint256 bal = bids[_nftId][msg.sender];
        require(bal > 0, "Zero balance");
        bids[_nftId][msg.sender] = 0;

        if (auctionPurchaseToken[_nftId] != address(0)) {
            IERC20 paymentToken = IERC20(auctionPurchaseToken[_nftId]);
            paymentToken.transfer(msg.sender, bal);
        } else {
            payable(msg.sender).transfer(bal);
        }

        emit Withdraw(_nftId, msg.sender, bal);
    }
}
