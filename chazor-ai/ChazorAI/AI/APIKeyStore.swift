import Foundation
import Security

/// Where the Anthropic API key comes from.
///
/// Order of resolution:
/// 1. the `ANTHROPIC_API_KEY` environment variable — set it in the Xcode scheme for
///    development, it never touches the repository or the built binary;
/// 2. the Keychain, for a key the user pasted into Settings on a real device, where
///    environment variables do not exist.
///
/// The key is never stored in `UserDefaults`, never logged and never passed into any view.
/// UI code asks `isConfigured`; only `ClaudeService` ever reads the value itself.
enum APIKeyStore {

    static let environmentVariableName = "ANTHROPIC_API_KEY"
    private static let keychainService = "ai.chazor.anthropic"
    private static let keychainAccount = "api-key"

    static var isConfigured: Bool { currentKey()?.isEmpty == false }

    /// Reported in Settings so the user can see where the key was picked up from.
    static var sourceDescription: String {
        if environmentKey() != nil { return "Xcode scheme (\(environmentVariableName))" }
        if keychainKey() != nil { return "Keychain" }
        return "Не настроен"
    }

    static func currentKey() -> String? {
        environmentKey() ?? keychainKey()
    }

    private static func environmentKey() -> String? {
        guard let value = ProcessInfo.processInfo.environment[environmentVariableName] else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: Keychain

    @discardableResult
    static func saveToKeychain(_ key: String) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else { return removeFromKeychain() }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return true }
        guard updateStatus == errSecItemNotFound else { return false }

        var insert = query
        insert.merge(attributes) { current, _ in current }
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    @discardableResult
    static func removeFromKeychain() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    private static func keychainKey() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let key = String(data: data, encoding: .utf8) else {
            return nil
        }
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
