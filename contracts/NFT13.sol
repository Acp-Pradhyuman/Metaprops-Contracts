//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2; // required to accept structs as function parameters

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NFT13 is ERC721URIStorage, EIP712 {
    using SafeERC20 for IERC20;
    //auto-increment field for each token
    using Counters for Counters.Counter;
    Counters.Counter private _itemIds;
    address public admin;
    address payable public wallet;
    uint256 public platformCommission;
    mapping(uint256 => bool) public started;
    mapping(uint256 => bool) public ended;
    mapping(uint256 => uint256) public endAt;
    mapping(uint256 => uint256) public highestBid;
    mapping(uint256 => address) public highestBidder;
    mapping(uint256 => mapping(address => uint256)) public bids;

    // Counters.Counter private _tokenIds;

    // address contractAddress;

    // bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    string private constant SIGNING_DOMAIN = "Metaprops-Voucher";
    string private constant SIGNATURE_VERSION = "1";

    constructor(address _wallet)
        ERC721("Metaprops Tokens", "MTPS")
        EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION)
    {
        admin = msg.sender;
        platformCommission = 2;
        wallet = payable(_wallet);
        //_setupRole(MINTER_ROLE, minter);
    }

    ///@notice only owner modifier
    modifier onlyAdmin() {
        require(msg.sender == admin, "admin access");
        _;
    }

    ///@notice only owner modifier
    modifier onlyOwner(uint256 tokenId) {
        require(msg.sender == ownerOf(tokenId));
        _;
    }

    struct NFTVoucher {
        /// @notice The id of the token to be redeemed. Must be unique - if another token with this ID already exists, the redeem function will revert.
        uint256 tokenId;
        /// @notice The minimum price (in wei) that the NFT creator is willing to accept for the initial sale of this NFT.
        uint256 minPrice;
        /// @notice The metadata URI to associate with this token.
        string uri;
        /// @notice the EIP-712 signature of all other fields in the NFTVoucher struct. For a voucher to be valid, it must be signed by an account with the MINTER_ROLE.
        bytes signature;
    }

    struct MarketItem {
        uint256 tokenId;
        uint256 royalty;
        uint256 price;
        address payable creator;
        address payable seller;
        address payable owner;
        IERC20 token;
    }

    event MarketItemCreated(
        uint256 marketItemId,
        uint256 tokenId,
        uint256 price,
        uint256 royalty,
        address creator,
        address seller,
        address owner
    );

    event MarketItemResell(uint256 marketItemId);

    event Start(uint256 marketItemId);
    event Bid(uint256 tokenId, address sender, uint256 amount);
    event Withdraw(uint256 tokenId, address bidder, uint256 amount);
    event End(uint256 tokenId, address highestBidder, uint256 highestBid);

    mapping(uint256 => MarketItem) public allMarketItems;

    function changeWallet(address _wallet) public onlyAdmin {
        wallet = payable(_wallet);
    }

    function changePlatformCommision(uint256 _platformCommission)
        public
        onlyAdmin
    {
        platformCommission = _platformCommission;
    }

    function changeAdmin(address _admin) public onlyAdmin {
        admin = _admin;
    }

    /// @notice create a new token
    /// @param voucher : contains details of tokenId, price, uri and signature
    function createAndBuyTokenWETH(
        NFTVoucher calldata voucher,
        uint256 _royalty,
        IERC20 _token
    ) public payable {
        address signer = _verify(voucher); //here signer is the seller

        require(msg.sender != signer, "Sellers can't buy from marketplace");
        _itemIds.increment(); //incrementing our counter.
        uint256 marketItemId = _itemIds.current(); //storing current value of counter in a new local variable.

        //Initializing the structure MarketItem, and saving it in allMarketItems mapping with our local variable passed as an argument.
        allMarketItems[marketItemId] = MarketItem(
            voucher.tokenId,
            _royalty,
            voucher.minPrice,
            payable(signer), //Only creator will be able to create items to sell.
            payable(signer), //Marketplace is the seller when market item is first created.
            payable(msg.sender), //setting the owner
            _token
        );

        if (allMarketItems[marketItemId].token == IERC20(address(0))) {
            _transferBuy(msg.value, marketItemId, msg.sender);
        } else {
            _transferBuy(voucher.minPrice, marketItemId, msg.sender);
        }

        _mint(signer, voucher.tokenId); //mint the token
        _setTokenURI(voucher.tokenId, voucher.uri); //generate the URI
        _transfer(signer, msg.sender, voucher.tokenId);

        emit MarketItemCreated(
            marketItemId,
            voucher.tokenId,
            voucher.minPrice,
            _royalty,
            signer,
            signer,
            msg.sender
        );
    }

    function _transferBuy(
        uint256 _amount,
        uint256 _marketItemId,
        address _recipient
    ) internal {
        uint256 sellingPrice = _amount;

        uint256 commission = (platformCommission * sellingPrice) / 100;

        uint256 sellerShare = ((100 - platformCommission) * sellingPrice) / 100;

        if (allMarketItems[_marketItemId].token == IERC20(address(0))) {
            wallet.transfer(commission); //Transfering the listing fee to the admin of the marketplace.
            allMarketItems[_marketItemId].seller.transfer(sellerShare); //transferring the sale amount to the seller after deducting platform commission.
        } else {
            IERC20 token = allMarketItems[_marketItemId].token;
            token.transferFrom(_recipient, address(this), sellingPrice);
            token.transfer(wallet, commission);
            token.transfer(allMarketItems[_marketItemId].seller, sellerShare);
        }
    }

    function _transferAuctionBuy(uint256 _amount, uint256 _marketItemId)
        internal
    {
        uint256 sellingPrice = _amount;

        uint256 commission = (platformCommission * sellingPrice) / 100;

        uint256 sellerShare = ((100 - platformCommission) * sellingPrice) / 100;

        if (allMarketItems[_marketItemId].token == IERC20(address(0))) {
            wallet.transfer(commission); //Transfering the listing fee to the admin of the marketplace.
            allMarketItems[_marketItemId].seller.transfer(sellerShare); //transferring the sale amount to the seller after deducting platform commission.
        } else {
            IERC20 token = allMarketItems[_marketItemId].token;
            token.transfer(wallet, commission);
            token.transfer(allMarketItems[_marketItemId].seller, sellerShare);
        }
    }

    function setRoyalty(uint256 marketItemId, uint256 royalty) public {
        require(
            msg.sender == allMarketItems[marketItemId].creator,
            "not creator of the token"
        );
        allMarketItems[marketItemId].royalty = royalty;
    }

    function setSellerAndFixedPrice(uint256 marketItemId, uint256 price)
        public
    {
        require(
            msg.sender == allMarketItems[marketItemId].owner,
            "not owner of token"
        );
        allMarketItems[marketItemId].seller = payable(msg.sender);
        allMarketItems[marketItemId].price = price;
    }

    function setOwner(uint256 marketItemId, address newOwner) public onlyAdmin {
        require(
            allMarketItems[marketItemId].owner ==
                allMarketItems[marketItemId].seller,
            "nft not on sale"
        );
        allMarketItems[marketItemId].owner = payable(newOwner);
    }

    function setTokenURI(uint256 tokenId, string memory _tokenURI)
        public
        onlyOwner(tokenId)
    {
        setTokenURI(tokenId, _tokenURI);
    }

    function burn(uint256 tokenId) public onlyOwner(tokenId) {
        _burn(tokenId);
    }

    function _hash(NFTVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "NFTVoucher(uint256 tokenId,uint256 minPrice,string uri)"
                        ),
                        voucher.tokenId,
                        voucher.minPrice,
                        keccak256(bytes(voucher.uri))
                    )
                )
            );
    }

    function getChainID() external view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    function _verify(NFTVoucher calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);
        return ECDSA.recover(digest, voucher.signature);
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///auction///
    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    function cancelAuction(uint256 _marketItemId) public {
        require(
            allMarketItems[_marketItemId].owner == address(0),
            "Invalid call"
        );
        require(
            allMarketItems[_marketItemId].seller == msg.sender,
            "Invalid caller"
        );
        ended[allMarketItems[_marketItemId].tokenId] = true;
    }

    function start(
        uint256 _nftId,
        uint256 startingBid,
        uint256 auctionPeriodInDays,
        IERC20 _token,
        uint256 _royalty
    ) external {
        highestBid[_nftId] = startingBid;
        started[_nftId] = true;
        ended[_nftId] = false;
        endAt[_nftId] = block.timestamp + (auctionPeriodInDays * 1 days);

        _itemIds.increment(); //incrementing our counter.
        uint256 marketItemId = _itemIds.current(); //storing current value of counter in a new local variable.

        //Initializing the structure MarketItem, and saving it in allMarketItems mapping with our local variable passed as an argument.
        allMarketItems[marketItemId] = MarketItem(
            _nftId,
            _royalty,
            startingBid,
            payable(msg.sender),
            payable(msg.sender),
            payable(address(0)),
            _token
        );

        emit Start(marketItemId);
    }

    function bid(uint256 _marketItemId, uint256 amount) external payable {
        require(started[allMarketItems[_marketItemId].tokenId], "Not started.");
        require(
            !ended[allMarketItems[_marketItemId].tokenId],
            "Auction ended!"
        );
        require(
            block.timestamp < endAt[allMarketItems[_marketItemId].tokenId],
            "Ended!"
        );
        require(
            msg.sender != allMarketItems[_marketItemId].seller,
            "invalid caller"
        );

        uint256 currentBid;

        if (allMarketItems[_marketItemId].token == IERC20(address(0))) {
            currentBid =
                bids[allMarketItems[_marketItemId].tokenId][msg.sender] +
                msg.value;
            require(
                currentBid > highestBid[allMarketItems[_marketItemId].tokenId],
                "must bid more"
            );
        } else {
            IERC20 paymentToken = allMarketItems[_marketItemId].token;
            uint256 allowToPayAmount = paymentToken.allowance(
                msg.sender,
                address(this)
            );
            require(allowToPayAmount >= amount, "Invalid token allowance");

            currentBid =
                bids[allMarketItems[_marketItemId].tokenId][msg.sender] +
                amount;
            require(
                currentBid > highestBid[allMarketItems[_marketItemId].tokenId],
                "must bid more"
            );
            // Transfer bid
            paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        }

        bids[allMarketItems[_marketItemId].tokenId][msg.sender] = currentBid;
        highestBid[allMarketItems[_marketItemId].tokenId] = currentBid;
        highestBidder[allMarketItems[_marketItemId].tokenId] = msg.sender;
        emit Bid(allMarketItems[_marketItemId].tokenId, msg.sender, currentBid);
    }

    function end(
        uint256 _marketItemId,
        NFTVoucher calldata voucher,
        address bidder
    ) external {
        require(started[voucher.tokenId], "You need to start first!");
        require(!ended[voucher.tokenId], "Auction already ended!");

        address signer = _verify(voucher);
        require(
            allMarketItems[_marketItemId].seller == signer,
            "Invalid signature"
        );
        require(signer == msg.sender, "Only a creator can end the auction");
        require(
            bids[voucher.tokenId][bidder] > 0 || bidder == address(0),
            "Bidder not found"
        );

        ended[voucher.tokenId] = true;

        /////////////////////////////////////////////////////////////
        _mint(signer, voucher.tokenId); //mint the token
        _setTokenURI(voucher.tokenId, voucher.uri); //generate the URI

        if (bidder != address(0)) {
            _transferAuctionBuy(bids[voucher.tokenId][bidder], _marketItemId);

            bids[voucher.tokenId][bidder] = 0;

            _transfer(signer, bidder, voucher.tokenId);
            allMarketItems[_marketItemId].owner = payable(bidder);

            emit End(voucher.tokenId, bidder, bids[voucher.tokenId][bidder]);
        } else {
            _transferAuctionBuy(highestBid[voucher.tokenId], _marketItemId);
            bids[voucher.tokenId][highestBidder[voucher.tokenId]] = 0;

            _transfer(signer, highestBidder[voucher.tokenId], voucher.tokenId);
            allMarketItems[_marketItemId].owner = payable(
                highestBidder[voucher.tokenId]
            );

            emit End(
                voucher.tokenId,
                highestBidder[voucher.tokenId],
                highestBid[voucher.tokenId]
            );
        }
    }

    function withdraw(uint256 _marketItemId, uint256 _nftId) external payable {
        require(ended[_nftId], "Auction not ended yet!");
        uint256 bal = bids[_nftId][msg.sender];
        require(bal > 0, "Zero balance");
        bids[_nftId][msg.sender] = 0;

        if (allMarketItems[_marketItemId].token != IERC20(address(0))) {
            IERC20 paymentToken = allMarketItems[_marketItemId].token;
            paymentToken.transfer(msg.sender, bal);
        } else {
            payable(msg.sender).transfer(bal);
        }

        emit Withdraw(_nftId, msg.sender, bal);
    }
}
