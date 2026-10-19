<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Runtime seam for the LLM routes and Twin9's direct calls: production uses
 * curl, tests inject fakes (no real network call ever happens in the test
 * suite).
 */
final class LlmRuntime
{
    private static ?HttpClient $httpClient = null;

    private static ?MultiHttpClient $multiHttpClient = null;

    public static function httpClient(): HttpClient
    {
        return self::$httpClient ??= new CurlHttpClient();
    }

    /** Tests: inject a fake; pass null to restore the default. */
    public static function setHttpClient(?HttpClient $client): void
    {
        self::$httpClient = $client;
    }

    /** A fresh concurrent client: curl_multi, or the fake a test injected. */
    public static function multiHttpClient(): MultiHttpClient
    {
        return self::$multiHttpClient ?? new CurlMultiHttpClient();
    }

    /** Tests: inject a fake; pass null to restore the default. */
    public static function setMultiHttpClient(?MultiHttpClient $client): void
    {
        self::$multiHttpClient = $client;
    }
}
