import { TrulyAssign } from "../utils/TrulyAssign";
import ClashMetaDumper from "../Dumpers/clash-meta.js";

const BasicClashConfig = {
    "port": 7890,
    "socks-port": 7891,
    "mode": "Rule",
    "log-level": "info",
    "external-controller": ":9090",
    "dns": {
        "enable": false,
        "nameserver": ["119.29.29.29", "223.5.5.5"],
        "fallback": ["8.8.8.8",  "8.8.4.4",  "tls://1.0.0.1:853",  "tls://dns.google:853"]
    }
};

const BasicConfig = {
    ProxyRuleProviders: false,
    isUDP: true,
    isSSUoT: false,
    isInsecure: true,
    RemoteConfig: "https://raw.githubusercontent.com/kobe-koto/EdgeSub/main/public/minimal_remote_rules.ini",
    isForcedRefresh: false
}


import { RemoteConfigReader } from "../RemoteConfigReader/main.js";

export async function getClashMetaConfig (
    Proxies, 
    EdgeSubDB, 
    PassedConfig = {},
) {
    const Config = TrulyAssign(BasicConfig, PassedConfig);

    let RemoteConfig = await (new RemoteConfigReader(Config.RemoteConfig)).Process(EdgeSubDB, Config.isForcedRefresh)

    let ClashConfig = JSON.parse(JSON.stringify(BasicClashConfig))

    let Dumper = new ClashMetaDumper(Config.isUDP, Config.isSSUoT, Config.isInsecure)
    
    // validate proxies
    Proxies = Proxies.map(i => {
        if (Dumper.__validate(i)) {
            i.Hostname = i.Hostname.replace(/(^\[|\]$)/g, "");
            return i;
        }
    }).filter(i => !!i);
    // append proxies
    ClashConfig.proxies = Proxies.map(i => Dumper[i.__Type](i));

    

    // Append proxy groups.
    ClashConfig["proxy-groups"] = []
    for (let i of RemoteConfig.ProxyGroup) {

        // get Matched Proxies
        let MatchedProxies = [];
        for (let t of i.RegExps) {
            MatchedProxies = [ ...MatchedProxies, ...Proxies.filter( loc => loc.__Remark.match(new RegExp(t)) ) ]
        }
        // unique proxy
        MatchedProxies = Array.from(new Set(MatchedProxies));



        // generate proxies list 
        let GroupProxies = [];
        for (let t of i.GroupSelectors) {
            GroupProxies.push(t.replace(/^\[\]/, ""))
        }
        for (let t of MatchedProxies) {
            GroupProxies.push(t.__Remark)
        }
        if (MatchedProxies.length + i.GroupSelectors.length === 0) {
            // add fallback selector if no selector can be added
            GroupProxies.push("DIRECT")
            GroupProxies.push("REJECT")
        }

        //generate proxy group
        let ProxyGroup = {}
        ProxyGroup.name = i.name;
        ProxyGroup.type = i.type;
        if (i.type === "url-test" || i.type === "load-balance" || i.type === "fallback") {
            ProxyGroup.url = i.TestConfig.TestURL;
            ProxyGroup.interval = i.TestConfig.Interval;
        }
        if (i.type === "url-test") {
            ProxyGroup.tolerance = i.TestConfig.Tolerance;
        }
        ProxyGroup.proxies = GroupProxies;

        // append proxy group to config
        ClashConfig["proxy-groups"].push(ProxyGroup)
    }

    // append rule providers
    ClashConfig["rule-providers"] = {};
    for (let i in RemoteConfig.RuleProviders) {
        for (let t in RemoteConfig.RuleProviders[i]) {
            const RuleProviderItem = RemoteConfig.RuleProviders[i][t];
            const RuleProviderID = `${i}__${t}`;
            let RuleProviderURL;
            if (Config.ProxyRuleProviders) {
                let RuleProviderURLObject = new URL(Config.ProxyRuleProviders);
                RuleProviderURLObject.pathname = "/ruleset/proxy"
                RuleProviderURLObject.search = ""
                RuleProviderURLObject.searchParams.append("target", RuleProviderItem)
                RuleProviderURL = RuleProviderURLObject.toString()
            } else {
                RuleProviderURL = RuleProviderItem;
            }
            ClashConfig["rule-providers"][RuleProviderID] = {
                type: "http",
                behavior: "classical",
                url: RuleProviderURL,
                format: (RuleProviderItem.endsWith(".yaml") || RuleProviderItem.endsWith(".yml")) ? "yaml" : "text",
                interval: 21600
            }
        }
    }

    // Append rule sets;
    ClashConfig.rules = []
    for (let i in RemoteConfig.RuleProviders) {
        for (let t in RemoteConfig.RuleProviders[i]) {
            const RuleProviderID = `${i}__${t}`;
            ClashConfig.rules.push(`RULE-SET,${RuleProviderID},${i}`)
        }
    }
    for (let i in RemoteConfig.Rules) {
        ClashConfig.rules.push(`${RemoteConfig.Rules[i]},${i}`)
    }

    return ClashConfig;
}
