import AppKit
import AVFoundation
import CoreVideo
import Foundation

struct EncoderError: Error, CustomStringConvertible {
    let description: String
}

func fail(_ message: String) throws -> Never {
    throw EncoderError(description: message)
}

func pixelBuffer(from image: NSImage, size: CGSize) throws -> CVPixelBuffer {
    var pixelBuffer: CVPixelBuffer?
    let attrs: [String: Any] = [
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        kCVPixelBufferWidthKey as String: Int(size.width),
        kCVPixelBufferHeightKey as String: Int(size.height),
    ]

    let status = CVPixelBufferCreate(
        kCFAllocatorDefault,
        Int(size.width),
        Int(size.height),
        kCVPixelFormatType_32ARGB,
        attrs as CFDictionary,
        &pixelBuffer
    )

    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
        try fail("Could not create pixel buffer")
    }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: Int(size.width),
        height: Int(size.height),
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else {
        try fail("Could not create bitmap context")
    }

    context.setFillColor(NSColor.black.cgColor)
    context.fill(CGRect(origin: .zero, size: size))

    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        try fail("Could not read frame image")
    }

    context.interpolationQuality = .high
    context.draw(cgImage, in: CGRect(origin: .zero, size: size))
    return buffer
}

enum ColorMode {
    case sdr
    case hdrPQ
    case hdrHLG

    var isHDR: Bool {
        self != .sdr
    }
}

func encode(framesDirectory: URL, outputURL: URL, fps: Int, width: Int, height: Int, colorMode: ColorMode) throws {
    let fileManager = FileManager.default
    if fileManager.fileExists(atPath: outputURL.path) {
        try fileManager.removeItem(at: outputURL)
    }

    let frameURLs = try fileManager.contentsOfDirectory(
        at: framesDirectory,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
    )
    .filter { $0.pathExtension.lowercased() == "jpg" || $0.pathExtension.lowercased() == "jpeg" || $0.pathExtension.lowercased() == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

    if frameURLs.isEmpty {
        try fail("No frame images found in \(framesDirectory.path)")
    }

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    let megapixels = Double(width * height) / 1_000_000.0
    let bitrate = max(16_000_000, Int(megapixels * (colorMode.isHDR ? 18_000_000 : 12_000_000)))
    var compression: [String: Any] = [
        AVVideoAverageBitRateKey: bitrate,
    ]
    if !colorMode.isHDR {
        compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
    }
    var outputSettings: [String: Any] = [
        AVVideoCodecKey: colorMode.isHDR ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: compression,
    ]
    switch colorMode {
    case .sdr:
        break
    case .hdrPQ:
        outputSettings[AVVideoColorPropertiesKey] = [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_2020,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_SMPTE_ST_2084_PQ,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020,
        ]
    case .hdrHLG:
        outputSettings[AVVideoColorPropertiesKey] = [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_2020,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_2100_HLG,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020,
        ]
    }

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
        assetWriterInput: input,
        sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
        ]
    )

    guard writer.canAdd(input) else {
        try fail("Cannot add video input")
    }
    writer.add(input)

    guard writer.startWriting() else {
        try fail(writer.error?.localizedDescription ?? "Could not start writing")
    }
    writer.startSession(atSourceTime: .zero)

    let frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))
    let renderSize = CGSize(width: width, height: height)

    for (index, frameURL) in frameURLs.enumerated() {
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.01)
        }

        guard let image = NSImage(contentsOf: frameURL) else {
            try fail("Could not open \(frameURL.path)")
        }

        let buffer = try pixelBuffer(from: image, size: renderSize)
        let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(index))
        guard adaptor.append(buffer, withPresentationTime: presentationTime) else {
            try fail(writer.error?.localizedDescription ?? "Could not append frame \(index)")
        }

        if index % fps == 0 || index == frameURLs.count - 1 {
            print("Encoded frame \(index + 1)/\(frameURLs.count)")
        }
    }

    input.markAsFinished()
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting {
        semaphore.signal()
    }
    semaphore.wait()

    if writer.status != .completed {
        try fail(writer.error?.localizedDescription ?? "Writer finished with status \(writer.status.rawValue)")
    }
}

do {
    let args = CommandLine.arguments
    guard args.count == 6 || args.count == 7 else {
        print("Usage: swift encode_frames.swift <frames-dir> <output.mp4> <fps> <width> <height> [--hdr|--hdr-pq|--hdr-hlg]")
        exit(2)
    }

    let framesDirectory = URL(fileURLWithPath: args[1])
    let outputURL = URL(fileURLWithPath: args[2])
    guard let fps = Int(args[3]), let width = Int(args[4]), let height = Int(args[5]) else {
        try fail("fps, width and height must be integers")
    }

    let colorMode: ColorMode
    if args.contains("--hdr-hlg") {
        colorMode = .hdrHLG
    } else if args.contains("--hdr") || args.contains("--hdr-pq") {
        colorMode = .hdrPQ
    } else {
        colorMode = .sdr
    }

    try encode(framesDirectory: framesDirectory, outputURL: outputURL, fps: fps, width: width, height: height, colorMode: colorMode)
    print("Wrote \(outputURL.path)")
} catch {
    fputs("Error: \(error)\n", stderr)
    exit(1)
}
