# Reelful App - Automated Screenshot Capture

This directory contains Maestro flows for automated UI testing and screenshot capture.

## 🚀 Quick Start

### 1. Install Maestro

```bash
# macOS
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

### 2. Run a Single Flow

```bash
# Run the full screenshot flow
maestro test .maestro/flows/full-flow-screenshots.yaml

# Run individual screens
maestro test .maestro/flows/01-intro.yaml
maestro test .maestro/flows/02-auth-phone.yaml
```

### 3. Run All Flows

```bash
maestro test .maestro/flows/
```

## 📱 Test Credentials

The flows use these test credentials (backdoor login):

- **Phone**: `0000000000`
- **Password**: `3rwnSHUx2TFRvU`

## 📸 Screenshot Output

Screenshots are saved to: `.maestro/screenshots/`

## 🔄 Flow Structure


| Flow                         | Description                  | Screens Captured                |
| ---------------------------- | ---------------------------- | ------------------------------- |
| `01-intro.yaml`              | Intro/splash screen          | Intro with "Get Started" button |
| `02-auth-phone.yaml`         | Auth screen with phone input | Empty auth, phone entered       |
| `03-auth-password.yaml`      | Password entry (backdoor)    | Password screen                 |
| `full-flow-screenshots.yaml` | Complete flow                | All screens end-to-end          |


## 🛠️ Customizing Flows

### Wait for Dynamic Content

```yaml
# Wait for text to appear
- extendedWaitUntil:
    visible:
      text: "Loading complete"
    timeout: 10000

# Wait for element by ID
- extendedWaitUntil:
    visible:
      id: "videoPlayer"
    timeout: 15000
```

### Handle Async Operations

```yaml
# Wait for API response
- extendedWaitUntil:
    visible:
      text: "Your script is ready"
    timeout: 30000

# Or use a simple delay (less reliable)
- delay: 3000
```

### Simulate User Input

```yaml
# Type text
- inputText: "My story about the trip to SF"

# Tap buttons
- tapOn:
    text: "Generate Script"

# Scroll
- swipe:
    direction: DOWN
    duration: 300
```

## 🎭 Mocking Backend Responses

For fully automated screenshots with mock data, you have several options:

### Option 1: Enable Test Mode in Config

Edit `constants/config.ts`:

```typescript
export const ENABLE_TEST_RUN_MODE = true;
```

### Option 2: Use MSW (Mock Service Worker)

For web testing, you can mock API responses.

### Option 3: Create Mock Data Flows

See `mock-data-flow.yaml` for a flow that uses pre-created test data.

## 🏃 Running on CI/CD

### GitHub Actions Example

```yaml
name: Screenshot Tests

on: [push, pull_request]

jobs:
  screenshots:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Maestro
        run: curl -Ls "https://get.maestro.mobile.dev" | bash
      
      - name: Start Expo
        run: npx expo start --ios &
        
      - name: Wait for app
        run: sleep 60
        
      - name: Run screenshot flows
        run: ~/.maestro/bin/maestro test .maestro/flows/
        
      - name: Upload screenshots
        uses: actions/upload-artifact@v4
        with:
          name: screenshots
          path: .maestro/screenshots/
```

## 📋 Industry Best Practices

### 1. **Use Test IDs**

Add `testID` props to React Native components for reliable element selection:

```tsx
<TouchableOpacity testID="login-button" onPress={handleLogin}>
  <Text>Login</Text>
</TouchableOpacity>
```

### 2. **Separate Flows by Feature**

Keep flows modular and focused on specific user journeys.

### 3. **Version Control Screenshots**

Store baseline screenshots in git for visual regression testing.

### 4. **Run on Multiple Devices**

Test on different screen sizes for App Store screenshots:

```bash
maestro test --device "iPhone 15 Pro" .maestro/flows/
maestro test --device "iPhone 15 Pro Max" .maestro/flows/
maestro test --device "iPhone SE" .maestro/flows/
```

### 5. **Visual Regression with Percy/Chromatic**

Integrate with visual testing tools for automatic diff detection.

## 🐛 Troubleshooting

### App not launching

```bash
# Make sure simulator is running
xcrun simctl boot "iPhone 15 Pro"

# Check Maestro can see the device
maestro devices
```

### Elements not found

```bash
# Use Maestro Studio to inspect elements
maestro studio
```

### Timeouts

Increase the timeout in flows:

```yaml
- extendedWaitUntil:
    visible:
      text: "Slow loading content"
    timeout: 60000  # 60 seconds
```

## 📚 Resources

- [Maestro Documentation](https://maestro.mobile.dev/)
- [Maestro CLI Reference](https://maestro.mobile.dev/cli/test)
- [Maestro Studio](https://maestro.mobile.dev/maestro-studio) - Visual flow builder

