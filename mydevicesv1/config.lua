-- Environment Configuration
-- Edit the URLs below for QA and PROD environments

local config = {
    QA = {
        ValidationApiUrl = "https://qa2.slomins.com/QA/OntechSvcs/1.2/ontech/IsValidControl4MacAddress",
        BaseApiUrl = "https://api.arpha-tech.com"
    },
    PROD = {
        ValidationApiUrl = "https://svcs.slomins.com/PROD/OntechSvcs/1.2/ontech/IsValidControl4MacAddresss",
        BaseApiUrl = "https://api.arpha-tech.com"
    }
}

return config
