import { getDefaultHeader, getOptionsHeader } from "./utils/defaultHeader";
import { sha256 } from "js-sha256";

export async function onRequestPost (context) {
    const { request } = context;
    const defaultHeader = getDefaultHeader(new URL(request.url));

    const EdgeSubDB = context.env.EdgeSubDB;

    const { password } = await request.json()
    const hashedPassword = sha256(password)
    const hashedPasswordInDB = await EdgeSubDB.get("admin-password");

    // check for password
    if (hashedPassword !== hashedPasswordInDB) {
        return new Response (
            JSON.stringify({
                msg: "the provided old password does not match with the old password in database",
                success: false,
                shortIDs: []
            }), {
                status: 401,
                headers: defaultHeader
            }
        )
    }

    // const shortIDs = 
    //     ((await EdgeSubDB.list({ prefix: "short:" })).keys || [])
    //         .map(i => { 
    //             return { 
    //                 name: i.name, 
    //                 timestamp: EdgeSubDB.get(i.name).then(res => JSON.parse(res).timestamp) // its needed to be
    //             }
    //         });
    const shortIDs = await EdgeSubDB.list({ prefix: "short:" })
        .then(async listResult => {
            const keys = listResult.keys || [];
            const shortIDs = [];
            for (let i of keys) {
                let ShortItem = await EdgeSubDB.get(i.name)
                    .then(res => JSON.parse(res).timestamp)
                    .then(timestamp => ({ name: i.name, timestamp }));
                shortIDs.push(ShortItem)
            }
            return shortIDs
        })
        .catch(error => {
            throw "Error fetching short IDs:" + error
        });

    return new Response (
        JSON.stringify({
            msg: "OK",
            success: true,
            shortIDs
        }), {
            status: 200,
            headers: defaultHeader
        }
    )

}
export async function onRequestOptions (context) {
    const url = new URL(context.request.url);
    return new Response("OK", {
        status: 200,
        headers: getOptionsHeader(url)
    });
}
