import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/utils/db';
import Auction, { IBidder } from '@/utils/schemas/Auction';
import User from '@/utils/schemas/User';
import { getServerSession } from 'next-auth';

export async function POST(req: NextRequest) {
  console.log("=== BID API ROUTE STARTED ===");
  
  try {
    // Check for authentication
    console.log("Checking authentication...");
    const session = await getServerSession();
    if (!session) {
      console.log("❌ Authentication failed - no session");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("✅ Authentication successful:", session.user?.email || 'Unknown user');

    const blockchainAuctionId = req.nextUrl.pathname.split('/')[4];
    console.log("📋 Extracted blockchainAuctionId from URL:", blockchainAuctionId);

    console.log("📥 Parsing request body...");
    const body = await req.json();
    const { bidAmount, userWallet } = body;
    console.log("📋 Request data:", { bidAmount, userWallet, blockchainAuctionId });

    // Validate required fields
    if (!bidAmount || !userWallet) {
      console.log("❌ Validation failed - missing required fields");
      return NextResponse.json({ error: 'Missing required fields: bidAmount and userWallet' }, { status: 400 });
    }

    if (typeof bidAmount !== 'number' || bidAmount <= 0) {
      console.log("❌ Validation failed - invalid bid amount:", bidAmount);
      return NextResponse.json({ error: 'Invalid bid amount' }, { status: 400 });
    }
    console.log("✅ Request validation passed");

    console.log("🔌 Connecting to database...");
    await dbConnect();
    console.log("✅ Database connected");

    // Find the auction by blockchainAuctionId
    console.log("🔍 Looking for auction with blockchainAuctionId:", blockchainAuctionId);
    const auction = await Auction.findOne({ blockchainAuctionId });
    if (!auction) {
      console.log("❌ Auction not found for blockchainAuctionId:", blockchainAuctionId);
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    console.log("✅ Auction found:", {
      id: auction._id,
      name: auction.auctionName,
      minimumBid: auction.minimumBid,
      currency: auction.currency,
      biddersCount: auction.bidders?.length || 0
    });

    // Check if auction is active
    const now = new Date();
    console.log("⏰ Checking auction timing:", {
      now: now.toISOString(),
      endDate: auction.endDate.toISOString(),
      isActive: now <= auction.endDate
    });
    
    if (now > auction.endDate) {
      console.log("❌ Auction has ended");
      return NextResponse.json({ error: 'Auction has ended' }, { status: 400 });
    }

    // Find or create the user
    console.log("👤 Looking for user with wallet:", userWallet.toLowerCase());
    let user = await User.findOne({ wallet: userWallet.toLowerCase() });
    if (!user) {
      console.log("👤 User not found, creating new user...");
      user = new User({
        wallet: userWallet.toLowerCase(),
        participatedAuctions: []
      });
      await user.save();
      console.log("✅ New user created:", user._id);
    } else {
      console.log("✅ Existing user found:", user._id);
    }

    // Validate bid amount against minimum bid and existing highest bid
    if (bidAmount < auction.minimumBid) {
      console.log("❌ Bid amount too low:", {
        bidAmount,
        minimumBid: auction.minimumBid
      });
      return NextResponse.json({ 
        error: `Bid amount must be at least ${auction.minimumBid} ${auction.currency}` 
      }, { status: 400 });
    }

    // Check if there's a higher bid
    const currentHighestBid = auction.bidders.length > 0 
      ? Math.max(...auction.bidders.map((bidder: IBidder) => bidder.bidAmount))
      : 0;
    
    console.log("💰 Bid validation:", {
      newBidAmount: bidAmount,
      currentHighestBid,
      minimumBid: auction.minimumBid,
      isValidBid: bidAmount > currentHighestBid
    });

    if (bidAmount <= currentHighestBid) {
      console.log("❌ Bid amount not higher than current highest bid");
      return NextResponse.json({ 
        error: `Bid amount must be higher than the current highest bid of ${currentHighestBid} ${auction.currency}` 
      }, { status: 400 });
    }

    // Add the bid to the auction
    console.log("📝 Adding bid to auction...");
    const newBid = {
      user: user._id,
      bidAmount,
      bidTimestamp: new Date()
    };
    auction.bidders.push(newBid);
    console.log("📋 New bid object:", newBid);

    console.log("💾 Saving auction with new bid...");
    await auction.save();
    console.log("✅ Auction saved successfully");

    // Add auction to user's participated auctions if not already there
    if (!user.participatedAuctions.includes(auction._id)) {
      console.log("📝 Adding auction to user's participated auctions...");
      user.participatedAuctions.push(auction._id);
      await user.save();
      console.log("✅ User updated with participated auction");
    } else {
      console.log("ℹ️ User already has this auction in participated auctions");
    }

    const responseData = {
      success: true,
      message: 'Bid placed successfully',
      bid: {
        amount: bidAmount,
        currency: auction.currency,
        timestamp: new Date(),
        auctionId: auction._id
      }
    };
    
    console.log("✅ Bid placement successful! Returning response:", responseData);
    console.log("=== BID API ROUTE COMPLETED SUCCESSFULLY ===");
    
    return NextResponse.json(responseData, { status: 201 });

  } catch (error) {
    console.error('❌ ERROR in bid placement route:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    console.log("=== BID API ROUTE FAILED ===");
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}