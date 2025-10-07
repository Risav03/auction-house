import { NextRequest, NextResponse } from 'next/server';
import User from '../../../../utils/schemas/User';
import connectToDB from '@/utils/db';

export async function POST(req: NextRequest) {
	try {
		await connectToDB();
		// Get fid from x-user-fid header
		const fid = req.headers.get('x-user-fid');

		if (!fid) {
			return NextResponse.json({ error: 'Missing x-user-fid header' }, { status: 400 });
		}

		// Try to find the user
		let user = await User.findOne({ fid }).select('fid username displayName pfp_url wallet topics');
		if (!user) {

			const res = await fetch(
				`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
				{
					headers: {
						"x-api-key": process.env.NEYNAR_API_KEY as string,
					},
				}
			);
			if (!res.ok) {
				return NextResponse.json(
					{ error: "Error fetching user from external API" },
					{ status: res.status }
				);
			}
			const jsonRes = await res.json();
			const neynarRes = jsonRes.users?.[0];

			user = await User.create({ fid: fid, username: neynarRes?.username, displayName: neynarRes?.display_name, pfp_url: neynarRes?.pfp_url, wallet: neynarRes?.verified_addresses?.primary?.eth_address || neynarRes?.custody_address });

		}

		return NextResponse.json({ user });
	} catch (error: any) {
		return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest) {
	try {
		await connectToDB();
		const fid = req.headers.get('x-user-fid');
		if (!fid) {
			return NextResponse.json({ error: 'Missing x-user-fid header' }, { status: 400 });
		}
		const body = await req.json();
		const { topics } = body;
		if (!Array.isArray(topics)) {
			return NextResponse.json({ error: 'Missing topics array' }, { status: 400 });
		}
		const user = await User.findOneAndUpdate(
			{ fid },
			{ topics },
			{ new: true, select: 'fid username displayName pfp_url wallet topics' }
		);
		if (!user) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}
		return NextResponse.json({ success: true, user });
	} catch (error: any) {
		return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
	}
}