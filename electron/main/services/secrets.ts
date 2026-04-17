import keytar from 'keytar'

const SERVICE_CRED = 'SalesforceUATRunner.Credentials'
const SERVICE_API = 'SalesforceUATRunner.APIKeys'

export interface StoredCredentials {
  password: string
  securityToken?: string
}

export const SecretsService = {
  async saveOrgCredentials(orgId: string, creds: StoredCredentials): Promise<void> {
    await keytar.setPassword(SERVICE_CRED, orgId, JSON.stringify(creds))
  },
  async getOrgCredentials(orgId: string): Promise<StoredCredentials | null> {
    const raw = await keytar.getPassword(SERVICE_CRED, orgId)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StoredCredentials
    } catch {
      return null
    }
  },
  async deleteOrgCredentials(orgId: string): Promise<void> {
    await keytar.deletePassword(SERVICE_CRED, orgId)
  },

  async setApiKey(provider: string, key: string): Promise<void> {
    await keytar.setPassword(SERVICE_API, provider, key)
  },
  async getApiKey(provider: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_API, provider)
  },
  async hasApiKey(provider: string): Promise<boolean> {
    const v = await keytar.getPassword(SERVICE_API, provider)
    return !!v && v.length > 0
  },
  async deleteApiKey(provider: string): Promise<void> {
    await keytar.deletePassword(SERVICE_API, provider)
  }
}
