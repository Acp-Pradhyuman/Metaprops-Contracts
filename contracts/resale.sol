//SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./NFT13.sol";

contract Resale {
    using SafeERC20 for IERC20;
    address public admin;
    address payable public wallet;
    uint256 public platformCommission;
    mapping(uint256 => bool) public started;
    mapping(uint256 => bool) public ended;
    mapping(uint256 => uint256) public endAt;
    mapping(uint256 => uint256) public highestBid;
    mapping(uint256 => address) public highestBidder;
    mapping(uint256 => mapping(address => uint256)) public bids;
    mapping(uint256 => address) public nftOwner;

    event Start(uint256 marketItemId);
    event Bid(uint256 tokenId, address sender, uint256 amount);
    event Withdraw(uint256 tokenId, address bidder, uint256 amount);
    event End(uint256 tokenId, address highestBidder, uint256 highestBid);

    constructor(address _wallet) {
        admin = msg.sender;
        platformCommission = 2;
        wallet = payable(_wallet);
    }

    // [ MODIFIERS ]
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can access this");
        _;
    }

    event MarketItemResold(
        uint256 marketItemId,
        address nftContract,
        uint256 tokenId,
        address creator,
        uint256 royalty,
        uint256 price
    );

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

    function getNFTRoyalty(NFT13 nft, uint256 id)
        public
        view
        returns (
            uint256 tokenId,
            uint256 royalty,
            address creator,
            address seller,
            address owner,
            uint256 price
        )
    {
        (
            uint256 _tokenId,
            uint256 _royalty,
            uint256 _price,
            address _creator,
            address _seller,
            address _owner,

        ) = nft.allMarketItems(id);
        return (_tokenId, _royalty, _creator, _seller, _owner, _price);
    }

    function getNFTpaymentMethod(NFT13 nft, uint256 id)
        public
        view
        returns (IERC20 token)
    {
        (, , , , , , IERC20 _token) = nft.allMarketItems(id);
        return _token;
    }

    function cancelSale(NFT13 _nftContract, uint256 _marketItemId) public {
        (uint256 _nftId, , , address _seller, address _owner, ) = getNFTRoyalty(
            _nftContract,
            _marketItemId
        );

        require(_seller == _owner, "Not allowed to cancel");
        require(nftOwner[_nftId] == msg.sender, "Not allowed to cancel");
        ended[_nftId] = true;
        nftOwner[_nftId] = address(0);
        IERC721(_nftContract).transferFrom(address(this), msg.sender, _nftId);
    }

    function secondarySale(NFT13 _nftContract, uint256 _marketItemId) public {
        (uint256 _nftId, , , address _seller, address _owner, ) = getNFTRoyalty(
            _nftContract,
            _marketItemId
        );
        require(_seller == _owner, "Not allowed to sell");
        require(_seller == msg.sender, "Not allowed to sell");
        require(
            IERC721(_nftContract).ownerOf(_nftId) == msg.sender,
            "not owner"
        );
        IERC721(_nftContract).transferFrom(msg.sender, address(this), _nftId);
        nftOwner[_nftId] = msg.sender;
    }

    function secondaryBuy(uint256 _marketItemId, NFT13 _nftContract)
        public
        payable
    {
        (
            uint256 _nftId,
            uint256 _royalty,
            address _creator,
            address _seller,
            address _owner,
            uint256 _amount
        ) = getNFTRoyalty(_nftContract, _marketItemId);

        IERC20 _token = getNFTpaymentMethod(_nftContract, _marketItemId);

        require(_seller == _owner, "Not allowed to buy");
        require(nftOwner[_nftId] != address(0), "Invalid nft");

        if (_token == IERC20(address(0))) {
            require(msg.value >= _amount, "Invalid amount");
        } else {
            uint256 allowToPayAmount = _token.allowance(
                msg.sender,
                address(this)
            );
            require(allowToPayAmount >= _amount, "Invalid token allowance");
        }

        _transferSecondaryBuy(
            _amount,
            _royalty,
            msg.sender,
            payable(_creator),
            payable(_seller),
            _token
        );

        IERC721(_nftContract).transferFrom(address(this), msg.sender, _nftId);
        emit MarketItemResold(
            _marketItemId,
            address(_nftContract),
            _nftId,
            _creator,
            _royalty,
            _amount
        );
    }

    function _transferSecondaryBuy(
        uint256 _amount,
        uint256 _royalty,
        address _recipient,
        address payable _creator,
        address payable _seller,
        IERC20 _token
    ) internal {
        uint256 royalty = (_royalty * _amount) / 100;

        uint256 commission = (platformCommission * _amount) / 100;

        uint256 transferAfterRoyaltyAndCommission = ((100 -
            _royalty -
            platformCommission) * _amount) / 100;

        if (_token == IERC20(address(0))) {
            _creator.transfer(royalty); //Sending royalty to the creator.
            _seller.transfer(transferAfterRoyaltyAndCommission); //Sending royalty to the creator.
            wallet.transfer(commission); //sending platform commission to the admin
        } else {
            _token.transferFrom(_recipient, address(this), _amount);
            _token.transfer(_creator, royalty);
            _token.transfer(_seller, transferAfterRoyaltyAndCommission);
            _token.transfer(wallet, commission);
        }
    }

    function _transferAuctionSecondaryBuy(
        uint256 _amount,
        uint256 _royalty,
        address payable _creator,
        address payable _seller,
        IERC20 _token
    ) internal {
        uint256 royalty = (_royalty * _amount) / 100;

        uint256 commission = (platformCommission * _amount) / 100;

        uint256 transferAfterRoyaltyAndCommission = ((100 -
            _royalty -
            platformCommission) * _amount) / 100;

        if (_token == IERC20(address(0))) {
            _creator.transfer(royalty); //Sending royalty to the creator.
            _seller.transfer(transferAfterRoyaltyAndCommission); //Sending royalty to the creator.
            wallet.transfer(commission); //sending platform commission to the admin
        } else {
            _token.transfer(_creator, royalty);
            _token.transfer(_seller, transferAfterRoyaltyAndCommission);
            _token.transfer(wallet, commission);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //auction
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    function resaleStart(
        NFT13 _nftContract,
        uint256 _marketItemId,
        uint256 startingBid,
        uint256 auctionPeriodInDays
    ) external {
        (uint256 _nftId, , , address _seller, address _owner, ) = getNFTRoyalty(
            _nftContract,
            _marketItemId
        );
        require(
            IERC721(_nftContract).ownerOf(_nftId) == msg.sender,
            "not owner"
        );
        require(_seller == _owner, "Not allowed to sell");
        require(_seller == msg.sender, "Not allowed to sell");
        // require(!started[_nftId], "Already started!");
        highestBid[_nftId] = startingBid;
        started[_nftId] = true;
        ended[_nftId] = false;
        endAt[_nftId] = block.timestamp + (auctionPeriodInDays * 1 days);
        nftOwner[_nftId] = msg.sender;
        IERC721(_nftContract).transferFrom(msg.sender, address(this), _nftId);
        emit Start(_nftId);
    }

    function resaleBid(
        uint256 _nftId,
        uint256 amount,
        NFT13 _nftContract,
        uint256 _marketItemId
    ) external payable {
        IERC20 _token = getNFTpaymentMethod(_nftContract, _marketItemId);

        require(started[_nftId], "Not started.");
        require(!ended[_nftId], "Auction already ended!");
        require(block.timestamp < endAt[_nftId], "Ended!");
        require(msg.sender != nftOwner[_nftId], "invalid caller");

        uint256 currentBid;

        if (_token == IERC20(address(0))) {
            currentBid = bids[_nftId][msg.sender] + msg.value;
            require(currentBid > highestBid[_nftId], "must bid more");
        } else {
            uint256 allowToPayAmount = _token.allowance(
                msg.sender,
                address(this)
            );
            require(allowToPayAmount >= amount, "Invalid token allowance");
            currentBid = bids[_nftId][msg.sender] + amount;
            require(currentBid > highestBid[_nftId], "must bid more");
            _token.safeTransferFrom(msg.sender, address(this), amount);
        }

        bids[_nftId][msg.sender] = currentBid;
        highestBid[_nftId] = currentBid;
        highestBidder[_nftId] = msg.sender;
        emit Bid(_nftId, msg.sender, currentBid);
    }

    function resaleEnd(
        NFT13 _nftContract,
        uint256 _marketItemId,
        address bidder
    ) external {
        (
            uint256 _nftId,
            uint256 _royalty,
            address _creator,
            ,
            ,

        ) = getNFTRoyalty(_nftContract, _marketItemId);
        IERC20 _token = getNFTpaymentMethod(_nftContract, _marketItemId);

        require(started[_nftId], "You need to start first!");
        require(!ended[_nftId], "Auction already ended!");

        require(
            nftOwner[_nftId] == msg.sender,
            "Only a creator can end the auction"
        );
        require(
            bids[_nftId][bidder] > 0 || bidder == address(0),
            "Bidder not found"
        );

        ended[_nftId] = true;

        if (bidder != address(0)) {
            _transferAuctionSecondaryBuy(
                bids[_nftId][bidder],
                _royalty,
                payable(_creator),
                payable(msg.sender),
                _token
            );

            bids[_nftId][bidder] = 0;

            IERC721(_nftContract).transferFrom(address(this), bidder, _nftId);

            emit End(_nftId, bidder, bids[_nftId][bidder]);
        } else {
            _transferAuctionSecondaryBuy(
                highestBid[_nftId],
                _royalty,
                payable(_creator),
                payable(msg.sender),
                _token
            );

            bids[_nftId][highestBidder[_nftId]] = 0;

            IERC721(_nftContract).transferFrom(
                address(this),
                highestBidder[_nftId],
                _nftId
            );

            emit End(_nftId, highestBidder[_nftId], highestBid[_nftId]);
        }
    }

    function resaleWithdraw(uint256 _nftId, IERC20 _token) external payable {
        require(ended[_nftId], "Auction not ended yet!");
        uint256 bal = bids[_nftId][msg.sender];
        require(bal > 0, "Zero balance");
        bids[_nftId][msg.sender] = 0;

        if (_token != IERC20(address(0))) {
            _token.transfer(msg.sender, bal);
        } else {
            payable(msg.sender).transfer(bal);
        }

        emit Withdraw(_nftId, msg.sender, bal);
    }
}
